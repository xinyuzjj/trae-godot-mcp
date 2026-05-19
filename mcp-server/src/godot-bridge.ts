/**
 * Godot Bridge - TCP client for real-time Godot Editor communication
 * Connects MCP server to Godot Editor plugin via TCP (newline-delimited JSON)
 */

import * as net from 'net';
import { EventEmitter } from 'events';

const GODOT_TCP_PORT = 9742;
const RECONNECT_INTERVAL = 5000;
const MESSAGE_DELIMITER = '\n';

interface GodotResponse {
  request_id?: string;
  type?: string;
  [key: string]: any;
}

export class GodotBridge extends EventEmitter {
  private socket: net.Socket | null = null;
  private isConnected: boolean = false;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pendingRequests: Map<string, { resolve: Function; reject: Function }> = new Map();
  private requestIdCounter: number = 0;
  private buffer: string = '';

  constructor() {
    super();
  }

  async connect(): Promise<boolean> {
    if (this.isConnected) {
      return true;
    }

    return new Promise((resolve, reject) => {
      const client = new net.Socket();
      this.socket = client;

      client.connect(GODOT_TCP_PORT, '127.0.0.1', () => {
        console.error('[GodotBridge] Connected to Godot Editor via TCP');
        this.isConnected = true;
        this.emit('connected');
        resolve(true);
      });

      client.on('data', (data: Buffer) => {
        this.buffer += data.toString('utf-8');
        this.processBuffer();
      });

      client.on('error', (error: Error) => {
        console.error('[GodotBridge] TCP error:', error.message);
        this.isConnected = false;
        this.emit('error', error);
        if (!this.isConnected) {
          reject(error);
        }
      });

      client.on('close', () => {
        console.error('[GodotBridge] Connection closed');
        this.isConnected = false;
        this.emit('disconnected');
        this.scheduleReconnect();
      });

      setTimeout(() => {
        if (!this.isConnected) {
          client.destroy();
          reject(new Error('Connection timeout'));
        }
      }, 5000);
    });
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.isConnected = false;
    this.buffer = '';
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    console.error(`[GodotBridge] Reconnecting in ${RECONNECT_INTERVAL}ms...`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(() => {});
    }, RECONNECT_INTERVAL);
  }

  private processBuffer(): void {
    while (this.buffer.includes(MESSAGE_DELIMITER)) {
      const idx = this.buffer.indexOf(MESSAGE_DELIMITER);
      const message = this.buffer.substring(0, idx).trim();
      this.buffer = this.buffer.substring(idx + 1);

      if (message.length > 0) {
        this.handleMessage(message);
      }
    }
  }

  private handleMessage(message: string): void {
    try {
      const data: GodotResponse = JSON.parse(message);

      if (data.request_id && this.pendingRequests.has(data.request_id)) {
        const { resolve } = this.pendingRequests.get(data.request_id)!;
        this.pendingRequests.delete(data.request_id);
        resolve(data);
      } else {
        this.emit('notification', data);
      }
    } catch (error) {
      console.error('[GodotBridge] Failed to parse message:', message);
    }
  }

  private generateRequestId(): string {
    return `req_${++this.requestIdCounter}_${Date.now()}`;
  }

  async sendCommand(command: string, params: Record<string, any> = {}): Promise<any> {
    if (!this.isConnected || !this.socket) {
      throw new Error('Not connected to Godot Editor');
    }

    const requestId = this.generateRequestId();
    const message = JSON.stringify({
      command,
      request_id: requestId,
      ...params
    }) + MESSAGE_DELIMITER;

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(requestId, { resolve, reject });
      this.socket!.write(message, 'utf-8');

      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          reject(new Error(`Command '${command}' timed out`));
        }
      }, 30000);
    });
  }

  // Convenience methods
  async getSceneTree() { return this.sendCommand('get_scene_tree'); }
  async getNodeProperties(nodePath: string) { return this.sendCommand('get_node_properties', { node_path: nodePath }); }
  async setNodeProperty(nodePath: string, property: string, value: any) { return this.sendCommand('set_node_property', { node_path: nodePath, property, value }); }
  async getScriptContent(scriptPath: string) { return this.sendCommand('get_script_content', { script_path: scriptPath }); }
  async setScriptContent(scriptPath: string, content: string) { return this.sendCommand('set_script_content', { script_path: scriptPath, content }); }
  async getSelectedNodes() { return this.sendCommand('get_selected_nodes'); }
  async selectNode(nodePath: string) { return this.sendCommand('select_node', { node_path: nodePath }); }
  async runProject() { return this.sendCommand('run_project'); }
  async stopProject() { return this.sendCommand('stop_project'); }
  async saveScene() { return this.sendCommand('save_scene'); }
  async getProjectFiles(directory: string = 'res://') { return this.sendCommand('get_project_files', { directory }); }
  async getDebugOutput() { return this.sendCommand('get_debug_output'); }
  async createNode(parentPath: string, nodeType: string, nodeName: string) { return this.sendCommand('create_node', { parent_path: parentPath, node_type: nodeType, node_name: nodeName }); }
  async deleteNode(nodePath: string) { return this.sendCommand('delete_node', { node_path: nodePath }); }

  getConnectionStatus(): boolean { return this.isConnected; }
}
