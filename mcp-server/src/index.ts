#!/usr/bin/env node
/**
 * Enhanced Trae-Godot MCP Server
 * 
 * This MCP server provides real-time tools for interacting with the Godot game engine.
 * It connects to a Godot Editor plugin via WebSocket for live scene editing,
 * script modification, and debugging.
 * 
 * Features:
 * - Real-time scene tree viewing and editing
 * - Live script editing with immediate feedback
 * - Node property modification
 * - Project execution control
 * - Debug output capture
 * 
 * @author xinyuzjj
 * @version 2.0.0
 */

import { fileURLToPath } from 'url';
import { join, dirname, basename, normalize, resolve } from 'path';
import { existsSync, readdirSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { spawn, execFile } from 'child_process';
import { promisify } from 'util';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { GodotBridge } from './godot-bridge.js';

const execFileAsync = promisify(execFile);

// Debug mode configuration
const DEBUG_MODE: boolean = process.env.DEBUG === 'true';

// Derive __filename and __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// Interfaces
// ============================================================================

interface ToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
  _meta?: { [key: string]: unknown };
}

// ============================================================================
// Main Server Class
// ============================================================================

class TraeGodotServer {
  private server: Server;
  private godotBridge: GodotBridge;
  private godotPath: string | null = null;

  constructor() {
    // Initialize Godot Bridge
    this.godotBridge = new GodotBridge();
    this.setupGodotBridgeEvents();

    // Initialize the MCP server
    this.server = new Server(
      {
        name: 'trae-godot-mcp',
        version: '2.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Set up tool handlers
    this.setupToolHandlers();

    // Error handling
    this.server.onerror = (error) => console.error('[MCP Error]', error);

    // Cleanup on exit
    process.on('SIGINT', async () => {
      await this.cleanup();
      process.exit(0);
    });

    // Try to connect to Godot Editor
    this.connectToGodot();
  }

  private setupGodotBridgeEvents(): void {
    this.godotBridge.on('connected', () => {
      console.error('[TraeGodotServer] Connected to Godot Editor');
    });

    this.godotBridge.on('disconnected', () => {
      console.error('[TraeGodotServer] Disconnected from Godot Editor');
    });

    this.godotBridge.on('notification', (data: any) => {
      // Handle notifications from Godot (e.g., selection changes)
      console.error('[TraeGodotServer] Notification from Godot:', data);
    });
  }

  private async connectToGodot(): Promise<void> {
    try {
      await this.godotBridge.connect();
    } catch (error) {
      console.error('[TraeGodotServer] Failed to connect to Godot Editor:', error);
      console.error('[TraeGodotServer] Make sure the Trae MCP plugin is installed and enabled in Godot Editor');
    }
  }

  private logDebug(message: string): void {
    if (DEBUG_MODE) {
      console.error(`[DEBUG] ${message}`);
    }
  }

  private createErrorResponse(message: string, details?: string): ToolResult {
    console.error(`[SERVER] Error: ${message}`);

    const response: ToolResult = {
      content: [
        {
          type: 'text',
          text: message,
        },
      ],
      isError: true,
    };

    if (details) {
      response.content.push({
        type: 'text',
        text: details,
      });
    }

    return response;
  }

  private createSuccessResponse(message: string, data?: any): ToolResult {
    const response: ToolResult = {
      content: [
        {
          type: 'text',
          text: message,
        },
      ],
    };

    if (data !== undefined) {
      response.content.push({
        type: 'text',
        text: typeof data === 'string' ? data : JSON.stringify(data, null, 2),
      });
    }

    return response;
  }

  private async cleanup(): Promise<void> {
    this.logDebug('Cleaning up resources');
    this.godotBridge.disconnect();
    await this.server.close();
  }

  // ============================================================================
  // Tool Handlers Setup
  // ============================================================================

  private setupToolHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        // Connection Status
        {
          name: 'check_godot_connection',
          description: 'Check if connected to Godot Editor',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        // Scene Tree Operations
        {
          name: 'get_scene_tree',
          description: 'Get the current scene tree structure from Godot Editor',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        {
          name: 'get_node_properties',
          description: 'Get all editable properties of a node',
          inputSchema: {
            type: 'object',
            properties: {
              nodePath: {
                type: 'string',
                description: 'Path to the node (e.g., "root/Player/Sprite2D")',
              },
            },
            required: ['nodePath'],
          },
        },
        {
          name: 'set_node_property',
          description: 'Set a property value on a node',
          inputSchema: {
            type: 'object',
            properties: {
              nodePath: {
                type: 'string',
                description: 'Path to the node',
              },
              property: {
                type: 'string',
                description: 'Property name',
              },
              value: {
                description: 'Property value (any type)',
              },
            },
            required: ['nodePath', 'property', 'value'],
          },
        },
        {
          name: 'get_selected_nodes',
          description: 'Get currently selected nodes in Godot Editor',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        {
          name: 'select_node',
          description: 'Select a node in the Godot Editor',
          inputSchema: {
            type: 'object',
            properties: {
              nodePath: {
                type: 'string',
                description: 'Path to the node to select',
              },
            },
            required: ['nodePath'],
          },
        },
        // Script Operations
        {
          name: 'get_script_content',
          description: 'Get the content of a GDScript file',
          inputSchema: {
            type: 'object',
            properties: {
              scriptPath: {
                type: 'string',
                description: 'Path to the script file (e.g., "res://scripts/player.gd")',
              },
            },
            required: ['scriptPath'],
          },
        },
        {
          name: 'set_script_content',
          description: 'Update the content of a GDScript file',
          inputSchema: {
            type: 'object',
            properties: {
              scriptPath: {
                type: 'string',
                description: 'Path to the script file',
              },
              content: {
                type: 'string',
                description: 'New script content',
              },
            },
            required: ['scriptPath', 'content'],
          },
        },
        // Node Management
        {
          name: 'create_node',
          description: 'Create a new node in the scene',
          inputSchema: {
            type: 'object',
            properties: {
              parentPath: {
                type: 'string',
                description: 'Path to the parent node (default: root)',
              },
              nodeType: {
                type: 'string',
                description: 'Type of node to create (e.g., "Sprite2D", "CharacterBody2D")',
              },
              nodeName: {
                type: 'string',
                description: 'Name for the new node',
              },
            },
            required: ['nodeType', 'nodeName'],
          },
        },
        {
          name: 'delete_node',
          description: 'Delete a node from the scene',
          inputSchema: {
            type: 'object',
            properties: {
              nodePath: {
                type: 'string',
                description: 'Path to the node to delete',
              },
            },
            required: ['nodePath'],
          },
        },
        {
          name: 'duplicate_node',
          description: 'Duplicate an existing node',
          inputSchema: {
            type: 'object',
            properties: {
              nodePath: {
                type: 'string',
                description: 'Path to the node to duplicate',
              },
            },
            required: ['nodePath'],
          },
        },
        // Project Control
        {
          name: 'run_project',
          description: 'Run the current Godot project',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        {
          name: 'stop_project',
          description: 'Stop the running Godot project',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        {
          name: 'save_scene',
          description: 'Save the current scene',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        {
          name: 'reload_scene',
          description: 'Reload the current scene',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        // Debug
        {
          name: 'get_debug_output',
          description: 'Get the debug output from the running project',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        {
          name: 'get_errors',
          description: 'Get compilation errors and warnings',
          inputSchema: {
            type: 'object',
            properties: {},
            required: [],
          },
        },
        // File Browser
        {
          name: 'get_project_files',
          description: 'List files in the project directory',
          inputSchema: {
            type: 'object',
            properties: {
              directory: {
                type: 'string',
                description: 'Directory path (default: "res://")',
              },
            },
            required: [],
          },
        },
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      this.logDebug(`Handling tool request: ${request.params.name}`);

      let result: ToolResult;
      try {
        switch (request.params.name) {
          case 'check_godot_connection':
            result = await this.handleCheckConnection();
            break;
          case 'get_scene_tree':
            result = await this.handleGetSceneTree();
            break;
          case 'get_node_properties':
            result = await this.handleGetNodeProperties(request.params.arguments);
            break;
          case 'set_node_property':
            result = await this.handleSetNodeProperty(request.params.arguments);
            break;
          case 'get_selected_nodes':
            result = await this.handleGetSelectedNodes();
            break;
          case 'select_node':
            result = await this.handleSelectNode(request.params.arguments);
            break;
          case 'get_script_content':
            result = await this.handleGetScriptContent(request.params.arguments);
            break;
          case 'set_script_content':
            result = await this.handleSetScriptContent(request.params.arguments);
            break;
          case 'create_node':
            result = await this.handleCreateNode(request.params.arguments);
            break;
          case 'delete_node':
            result = await this.handleDeleteNode(request.params.arguments);
            break;
          case 'duplicate_node':
            result = await this.handleDuplicateNode(request.params.arguments);
            break;
          case 'run_project':
            result = await this.handleRunProject();
            break;
          case 'stop_project':
            result = await this.handleStopProject();
            break;
          case 'save_scene':
            result = await this.handleSaveScene();
            break;
          case 'reload_scene':
            result = await this.handleReloadScene();
            break;
          case 'get_debug_output':
            result = await this.handleGetDebugOutput();
            break;
          case 'get_errors':
            result = await this.handleGetErrors();
            break;
          case 'get_project_files':
            result = await this.handleGetProjectFiles(request.params.arguments);
            break;
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${request.params.name}`
            );
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        result = this.createErrorResponse(`Tool execution failed: ${errorMessage}`);
      }

      return {
        content: result.content,
        isError: result.isError,
        _meta: result._meta,
      };
    });
  }

  // ============================================================================
  // Individual Tool Handlers
  // ============================================================================

  private async handleCheckConnection(): Promise<ToolResult> {
    const isConnected = this.godotBridge.getConnectionStatus();
    if (isConnected) {
      return this.createSuccessResponse('Connected to Godot Editor');
    } else {
      return this.createErrorResponse(
        'Not connected to Godot Editor',
        'Make sure the Trae MCP plugin is installed and enabled in Godot Editor.\n' +
        '1. Copy the plugin to your Godot project\'s addons folder\n' +
        '2. Enable "Trae MCP Integration" in Project Settings > Plugins\n' +
        '3. Restart Godot Editor'
      );
    }
  }

  private async handleGetSceneTree(): Promise<ToolResult> {
    try {
      const result = await this.godotBridge.getSceneTree();
      return this.createSuccessResponse('Scene tree retrieved:', result);
    } catch (error: any) {
      return this.createErrorResponse('Failed to get scene tree', error.message);
    }
  }

  private async handleGetNodeProperties(args: any): Promise<ToolResult> {
    if (!args.nodePath) {
      return this.createErrorResponse('nodePath is required');
    }

    try {
      const result = await this.godotBridge.getNodeProperties(args.nodePath);
      return this.createSuccessResponse(`Properties for node '${args.nodePath}':`, result);
    } catch (error: any) {
      return this.createErrorResponse('Failed to get node properties', error.message);
    }
  }

  private async handleSetNodeProperty(args: any): Promise<ToolResult> {
    if (!args.nodePath || !args.property || args.value === undefined) {
      return this.createErrorResponse('nodePath, property, and value are required');
    }

    try {
      const result = await this.godotBridge.setNodeProperty(
        args.nodePath,
        args.property,
        args.value
      );
      return this.createSuccessResponse(
        `Property '${args.property}' set on '${args.nodePath}'`,
        result
      );
    } catch (error: any) {
      return this.createErrorResponse('Failed to set node property', error.message);
    }
  }

  private async handleGetSelectedNodes(): Promise<ToolResult> {
    try {
      const result = await this.godotBridge.getSelectedNodes();
      return this.createSuccessResponse('Selected nodes:', result);
    } catch (error: any) {
      return this.createErrorResponse('Failed to get selected nodes', error.message);
    }
  }

  private async handleSelectNode(args: any): Promise<ToolResult> {
    if (!args.nodePath) {
      return this.createErrorResponse('nodePath is required');
    }

    try {
      const result = await this.godotBridge.selectNode(args.nodePath);
      return this.createSuccessResponse(`Node '${args.nodePath}' selected`, result);
    } catch (error: any) {
      return this.createErrorResponse('Failed to select node', error.message);
    }
  }

  private async handleGetScriptContent(args: any): Promise<ToolResult> {
    if (!args.scriptPath) {
      return this.createErrorResponse('scriptPath is required');
    }

    try {
      const result = await this.godotBridge.getScriptContent(args.scriptPath);
      return this.createSuccessResponse(`Script content for '${args.scriptPath}':`, result);
    } catch (error: any) {
      return this.createErrorResponse('Failed to get script content', error.message);
    }
  }

  private async handleSetScriptContent(args: any): Promise<ToolResult> {
    if (!args.scriptPath || !args.content) {
      return this.createErrorResponse('scriptPath and content are required');
    }

    try {
      const result = await this.godotBridge.setScriptContent(args.scriptPath, args.content);
      return this.createSuccessResponse(`Script '${args.scriptPath}' updated`, result);
    } catch (error: any) {
      return this.createErrorResponse('Failed to set script content', error.message);
    }
  }

  private async handleCreateNode(args: any): Promise<ToolResult> {
    if (!args.nodeType || !args.nodeName) {
      return this.createErrorResponse('nodeType and nodeName are required');
    }

    try {
      const result = await this.godotBridge.createNode(
        args.parentPath || 'root',
        args.nodeType,
        args.nodeName
      );
      return this.createSuccessResponse(
        `Node '${args.nodeName}' of type '${args.nodeType}' created`,
        result
      );
    } catch (error: any) {
      return this.createErrorResponse('Failed to create node', error.message);
    }
  }

  private async handleDeleteNode(args: any): Promise<ToolResult> {
    if (!args.nodePath) {
      return this.createErrorResponse('nodePath is required');
    }

    try {
      const result = await this.godotBridge.deleteNode(args.nodePath);
      return this.createSuccessResponse(`Node '${args.nodePath}' deleted`, result);
    } catch (error: any) {
      return this.createErrorResponse('Failed to delete node', error.message);
    }
  }

  private async handleDuplicateNode(args: any): Promise<ToolResult> {
    if (!args.nodePath) {
      return this.createErrorResponse('nodePath is required');
    }

    try {
      const result = await this.godotBridge.sendCommand('duplicate_node', { node_path: args.nodePath });
      return this.createSuccessResponse(`Node '${args.nodePath}' duplicated`, result);
    } catch (error: any) {
      return this.createErrorResponse('Failed to duplicate node', error.message);
    }
  }

  private async handleRunProject(): Promise<ToolResult> {
    try {
      const result = await this.godotBridge.runProject();
      return this.createSuccessResponse('Project is running', result);
    } catch (error: any) {
      return this.createErrorResponse('Failed to run project', error.message);
    }
  }

  private async handleStopProject(): Promise<ToolResult> {
    try {
      const result = await this.godotBridge.stopProject();
      return this.createSuccessResponse('Project stopped', result);
    } catch (error: any) {
      return this.createErrorResponse('Failed to stop project', error.message);
    }
  }

  private async handleSaveScene(): Promise<ToolResult> {
    try {
      const result = await this.godotBridge.saveScene();
      return this.createSuccessResponse('Scene saved', result);
    } catch (error: any) {
      return this.createErrorResponse('Failed to save scene', error.message);
    }
  }

  private async handleReloadScene(): Promise<ToolResult> {
    try {
      const result = await this.godotBridge.sendCommand('reload_scene');
      return this.createSuccessResponse('Scene reloaded', result);
    } catch (error: any) {
      return this.createErrorResponse('Failed to reload scene', error.message);
    }
  }

  private async handleGetDebugOutput(): Promise<ToolResult> {
    try {
      const result = await this.godotBridge.getDebugOutput();
      return this.createSuccessResponse('Debug output:', result);
    } catch (error: any) {
      return this.createErrorResponse('Failed to get debug output', error.message);
    }
  }

  private async handleGetErrors(): Promise<ToolResult> {
    try {
      const result = await this.godotBridge.sendCommand('get_errors');
      return this.createSuccessResponse('Errors:', result);
    } catch (error: any) {
      return this.createErrorResponse('Failed to get errors', error.message);
    }
  }

  private async handleGetProjectFiles(args: any): Promise<ToolResult> {
    try {
      const result = await this.godotBridge.getProjectFiles(args.directory || 'res://');
      return this.createSuccessResponse('Project files:', result);
    } catch (error: any) {
      return this.createErrorResponse('Failed to get project files', error.message);
    }
  }

  // ============================================================================
  // Server Start
  // ============================================================================

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Trae Godot MCP server running on stdio');
    console.error('Waiting for Godot Editor connection...');
  }
}

// ============================================================================
// Main Entry Point
// ============================================================================

const server = new TraeGodotServer();
server.run().catch(console.error);
