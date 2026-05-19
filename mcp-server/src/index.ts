#!/usr/bin/env node
/**
 * Enhanced Trae-Godot MCP Server v2.1
 * 
 * This MCP server provides real-time tools for interacting with the Godot game engine.
 * It connects to a Godot Editor plugin via TCP for live scene editing,
 * script modification, debugging, and AI-assisted development.
 * 
 * Features:
 * - Real-time scene tree viewing and editing
 * - Live script editing with immediate feedback
 * - Node property modification
 * - Project execution control
 * - Debug output capture
 * - Resource management
 * - Performance monitoring
 * - Code quality analysis
 * - Search and replace
 * 
 * @author xinyuzjj
 * @version 2.1.0
 */

import { fileURLToPath } from 'url';
import { dirname } from 'path';

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

import { GodotBridge } from './godot-bridge.js';

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

  constructor() {
    // Initialize Godot Bridge
    this.godotBridge = new GodotBridge();
    this.setupGodotBridgeEvents();

    // Initialize the MCP server
    this.server = new Server(
      {
        name: 'trae-godot-mcp',
        version: '2.1.0',
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

  private createErrorResponse(message: string, details?: string): ToolResult {
    console.error(`[SERVER] Error: ${message}`);
    const response: ToolResult = {
      content: [{ type: 'text', text: message }],
      isError: true,
    };
    if (details) {
      response.content.push({ type: 'text', text: details });
    }
    return response;
  }

  private createSuccessResponse(message: string, data?: any): ToolResult {
    const response: ToolResult = {
      content: [{ type: 'text', text: message }],
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
          inputSchema: { type: 'object', properties: {}, required: [] },
        },
        {
          name: 'get_connection_status',
          description: 'Get detailed connection status including Godot version',
          inputSchema: { type: 'object', properties: {}, required: [] },
        },
        // Scene Tree Operations
        {
          name: 'get_scene_tree',
          description: 'Get the current scene tree structure from Godot Editor',
          inputSchema: { type: 'object', properties: {}, required: [] },
        },
        {
          name: 'get_node_properties',
          description: 'Get all editable properties of a node',
          inputSchema: {
            type: 'object',
            properties: {
              nodePath: { type: 'string', description: 'Path to the node' },
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
              nodePath: { type: 'string', description: 'Path to the node' },
              property: { type: 'string', description: 'Property name' },
              value: { description: 'Property value' },
            },
            required: ['nodePath', 'property', 'value'],
          },
        },
        {
          name: 'get_selected_nodes',
          description: 'Get currently selected nodes in Godot Editor',
          inputSchema: { type: 'object', properties: {}, required: [] },
        },
        {
          name: 'select_node',
          description: 'Select a node in the Godot Editor',
          inputSchema: {
            type: 'object',
            properties: {
              nodePath: { type: 'string', description: 'Path to the node' },
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
              scriptPath: { type: 'string', description: 'Path to the script file' },
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
              scriptPath: { type: 'string', description: 'Path to the script' },
              content: { type: 'string', description: 'New script content' },
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
              parentPath: { type: 'string', description: 'Parent node path' },
              nodeType: { type: 'string', description: 'Node type (e.g., Sprite2D)' },
              nodeName: { type: 'string', description: 'Name for the new node' },
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
              nodePath: { type: 'string', description: 'Path to the node' },
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
              nodePath: { type: 'string', description: 'Path to the node' },
            },
            required: ['nodePath'],
          },
        },
        {
          name: 'rename_node',
          description: 'Rename a node',
          inputSchema: {
            type: 'object',
            properties: {
              nodePath: { type: 'string', description: 'Path to the node' },
              newName: { type: 'string', description: 'New name' },
            },
            required: ['nodePath', 'newName'],
          },
        },
        {
          name: 'reparent_node',
          description: 'Move a node to a different parent',
          inputSchema: {
            type: 'object',
            properties: {
              nodePath: { type: 'string', description: 'Path to the node' },
              newParentPath: { type: 'string', description: 'New parent path' },
            },
            required: ['nodePath', 'newParentPath'],
          },
        },
        // Project Control
        {
          name: 'run_project',
          description: 'Run the current Godot project',
          inputSchema: { type: 'object', properties: {}, required: [] },
        },
        {
          name: 'stop_project',
          description: 'Stop the running Godot project',
          inputSchema: { type: 'object', properties: {}, required: [] },
        },
        {
          name: 'save_scene',
          description: 'Save the current scene',
          inputSchema: { type: 'object', properties: {}, required: [] },
        },
        {
          name: 'save_all_scenes',
          description: 'Save all open scenes',
          inputSchema: { type: 'object', properties: {}, required: [] },
        },
        // Resource Management
        {
          name: 'import_asset',
          description: 'Import an asset into the project',
          inputSchema: {
            type: 'object',
            properties: {
              sourcePath: { type: 'string', description: 'Source file path' },
              targetPath: { type: 'string', description: 'Target path in project' },
            },
            required: ['sourcePath', 'targetPath'],
          },
        },
        {
          name: 'get_resource_info',
          description: 'Get information about a resource',
          inputSchema: {
            type: 'object',
            properties: {
              resourcePath: { type: 'string', description: 'Resource path' },
            },
            required: ['resourcePath'],
          },
        },
        // Scene Management
        {
          name: 'create_new_scene',
          description: 'Create a new scene file',
          inputSchema: {
            type: 'object',
            properties: {
              scenePath: { type: 'string', description: 'Path for the new scene' },
            },
            required: ['scenePath'],
          },
        },
        {
          name: 'switch_scene',
          description: 'Switch to a different scene',
          inputSchema: {
            type: 'object',
            properties: {
              scenePath: { type: 'string', description: 'Scene file path' },
            },
            required: ['scenePath'],
          },
        },
        {
          name: 'get_open_scenes',
          description: 'Get list of open scenes',
          inputSchema: { type: 'object', properties: {}, required: [] },
        },
        // Debug Tools
        {
          name: 'get_debug_output',
          description: 'Get debug output from the running project',
          inputSchema: { type: 'object', properties: {}, required: [] },
        },
        {
          name: 'capture_screenshot',
          description: 'Capture a screenshot of the game',
          inputSchema: {
            type: 'object',
            properties: {
              outputPath: { type: 'string', description: 'Output file path' },
            },
            required: ['outputPath'],
          },
        },
        {
          name: 'get_performance_stats',
          description: 'Get performance statistics (FPS, memory, draw calls)',
          inputSchema: { type: 'object', properties: {}, required: [] },
        },
        // Project Management
        {
          name: 'get_project_files',
          description: 'List files in the project directory',
          inputSchema: {
            type: 'object',
            properties: {
              directory: { type: 'string', description: 'Directory path' },
            },
            required: [],
          },
        },
        {
          name: 'get_project_stats',
          description: 'Get project statistics (scripts, scenes, resources count)',
          inputSchema: { type: 'object', properties: {}, required: [] },
        },
        {
          name: 'check_code_quality',
          description: 'Check code quality of a script',
          inputSchema: {
            type: 'object',
            properties: {
              scriptPath: { type: 'string', description: 'Script file path' },
            },
            required: ['scriptPath'],
          },
        },
        // Utility Tools
        {
          name: 'search_in_files',
          description: 'Search for text in project files',
          inputSchema: {
            type: 'object',
            properties: {
              searchPattern: { type: 'string', description: 'Text to search' },
              directory: { type: 'string', description: 'Directory to search' },
              fileExtensions: { type: 'array', description: 'File extensions to search' },
            },
            required: ['searchPattern'],
          },
        },
        {
          name: 'replace_in_files',
          description: 'Replace text in project files',
          inputSchema: {
            type: 'object',
            properties: {
              searchPattern: { type: 'string', description: 'Text to search' },
              replaceText: { type: 'string', description: 'Replacement text' },
              directory: { type: 'string', description: 'Directory' },
              fileExtensions: { type: 'array', description: 'File extensions' },
            },
            required: ['searchPattern', 'replaceText'],
          },
        },
        {
          name: 'batch_set_property',
          description: 'Set property on multiple nodes at once',
          inputSchema: {
            type: 'object',
            properties: {
              nodePaths: { type: 'array', description: 'Array of node paths' },
              property: { type: 'string', description: 'Property name' },
              value: { description: 'Property value' },
            },
            required: ['nodePaths', 'property', 'value'],
          },
        },
        {
          name: 'get_operation_log',
          description: 'Get operation history log',
          inputSchema: { type: 'object', properties: {}, required: [] },
        },
      ],
    }));

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      let result: ToolResult;
      try {
        const args = request.params.arguments || {};
        switch (request.params.name) {
          case 'check_godot_connection':
            result = await this.handleCheckConnection();
            break;
          case 'get_connection_status':
            result = await this.handleGetConnectionStatus();
            break;
          case 'get_scene_tree':
            result = await this.handleGetSceneTree();
            break;
          case 'get_node_properties':
            result = await this.handleGetNodeProperties(args);
            break;
          case 'set_node_property':
            result = await this.handleSetNodeProperty(args);
            break;
          case 'get_selected_nodes':
            result = await this.handleGetSelectedNodes();
            break;
          case 'select_node':
            result = await this.handleSelectNode(args);
            break;
          case 'get_script_content':
            result = await this.handleGetScriptContent(args);
            break;
          case 'set_script_content':
            result = await this.handleSetScriptContent(args);
            break;
          case 'create_node':
            result = await this.handleCreateNode(args);
            break;
          case 'delete_node':
            result = await this.handleDeleteNode(args);
            break;
          case 'duplicate_node':
            result = await this.handleDuplicateNode(args);
            break;
          case 'rename_node':
            result = await this.handleRenameNode(args);
            break;
          case 'reparent_node':
            result = await this.handleReparentNode(args);
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
          case 'save_all_scenes':
            result = await this.handleSaveAllScenes();
            break;
          case 'import_asset':
            result = await this.handleImportAsset(args);
            break;
          case 'get_resource_info':
            result = await this.handleGetResourceInfo(args);
            break;
          case 'create_new_scene':
            result = await this.handleCreateNewScene(args);
            break;
          case 'switch_scene':
            result = await this.handleSwitchScene(args);
            break;
          case 'get_open_scenes':
            result = await this.handleGetOpenScenes();
            break;
          case 'get_debug_output':
            result = await this.handleGetDebugOutput();
            break;
          case 'capture_screenshot':
            result = await this.handleCaptureScreenshot(args);
            break;
          case 'get_performance_stats':
            result = await this.handleGetPerformanceStats();
            break;
          case 'get_project_files':
            result = await this.handleGetProjectFiles(args);
            break;
          case 'get_project_stats':
            result = await this.handleGetProjectStats();
            break;
          case 'check_code_quality':
            result = await this.handleCheckCodeQuality(args);
            break;
          case 'search_in_files':
            result = await this.handleSearchInFiles(args);
            break;
          case 'replace_in_files':
            result = await this.handleReplaceInFiles(args);
            break;
          case 'batch_set_property':
            result = await this.handleBatchSetProperty(args);
            break;
          case 'get_operation_log':
            result = await this.handleGetOperationLog();
            break;
          default:
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        result = this.createErrorResponse(`Tool execution failed: ${errorMessage}`);
      }
      return { content: result.content, isError: result.isError, _meta: result._meta };
    });
  }

  // ============================================================================
  // Individual Tool Handlers
  // ============================================================================

  private async handleCheckConnection(): Promise<ToolResult> {
    const isConnected = this.godotBridge.getConnectionStatus();
    return isConnected
      ? this.createSuccessResponse('Connected to Godot Editor')
      : this.createErrorResponse('Not connected to Godot Editor', 'Make sure the Trae MCP plugin is installed and enabled');
  }

  private async handleGetConnectionStatus(): Promise<ToolResult> {
    try {
      const result = await this.godotBridge.sendCommand('get_connection_status');
      return this.createSuccessResponse('Connection status:', result);
    } catch (error: any) {
      return this.createErrorResponse('Failed to get connection status', error.message);
    }
  }

  private async handleGetSceneTree(): Promise<ToolResult> {
    try {
      const result = await this.godotBridge.sendCommand('get_scene_tree');
      return this.createSuccessResponse('Scene tree retrieved:', result);
    } catch (error: any) {
      return this.createErrorResponse('Failed to get scene tree', error.message);
    }
  }

  private async handleGetNodeProperties(args: any): Promise<ToolResult> {
    if (!args.nodePath) return this.createErrorResponse('nodePath is required');
    try {
      const result = await this.godotBridge.sendCommand('get_node_properties', { node_path: args.nodePath });
      return this.createSuccessResponse(`Properties for '${args.nodePath}':`, result);
    } catch (error: any) {
      return this.createErrorResponse('Failed to get node properties', error.message);
    }
  }

  private async handleSetNodeProperty(args: any): Promise<ToolResult> {
    if (!args.nodePath || !args.property || args.value === undefined) {
      return this.createErrorResponse('nodePath, property, and value are required');
    }
    try {
      const result = await this.godotBridge.sendCommand('set_node_property', {
        node_path: args.nodePath,
        property: args.property,
        value: args.value,
      });
      return this.createSuccessResponse(`Property '${args.property}' set on '${args.nodePath}'`, result);
    } catch (error: any) {
      return this.createErrorResponse('Failed to set node property', error.message);
    }
  }

  private async handleGetSelectedNodes(): Promise<ToolResult> {
    try {
      const result = await this.godotBridge.sendCommand('get_selected_nodes');
      return this.createSuccessResponse('Selected nodes:', result);
    } catch (error: any) {
      return this.createErrorResponse('Failed to get selected nodes', error.message);
    }
  }

  private async handleSelectNode(args: any): Promise<ToolResult> {
    if (!args.nodePath) return this.createErrorResponse('nodePath is required');
    try {
      const result = await this.godotBridge.sendCommand('select_node', { node_path: args.nodePath });
      return this.createSuccessResponse(`Node '${args.nodePath}' selected`, result);
    } catch (error: any) {
      return this.createErrorResponse('Failed to select node', error.message);
    }
  }

  private async handleGetScriptContent(args: any): Promise<ToolResult> {
    if (!args.scriptPath) return this.createErrorResponse('scriptPath is required');
    try {
      const result = await this.godotBridge.sendCommand('get_script_content', { script_path: args.scriptPath });
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
      const result = await this.godotBridge.sendCommand('set_script_content', {
        script_path: args.scriptPath,
        content: args.content,
      });
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
      const result = await this.godotBridge.sendCommand('create_node', {
        parent_path: args.parentPath || '',
        node_type: args.nodeType,
        node_name: args.nodeName,
      });
      return this.createSuccessResponse(`Node '${args.nodeName}' created`, result);
    } catch (error: any) {
      return this.createErrorResponse('Failed to create node', error.message);
    }
  }

  private async handleDeleteNode(args: any): Promise<ToolResult> {
    if (!args.nodePath) return this.createErrorResponse('nodePath is required');
    try {
      const result = await this.godotBridge.sendCommand('delete_node', { node_path: args.nodePath });
      return this.createSuccessResponse(`Node '${args.nodePath}' deleted`, result);
    } catch (error: any) {
      return this.createErrorResponse('Failed to delete node', error.message);
    }
  }

  private async handleDuplicateNode(args: any): Promise<ToolResult> {
    if (!args.nodePath) return this.createErrorResponse('nodePath is required');
    try {
      const result = await this.godotBridge.sendCommand('duplicate_node', { node_path: args.nodePath });
      return this.createSuccessResponse(`Node '${args.nodePath}' duplicated`, result);
    } catch (error: any) {
      return this.createErrorResponse('Failed to duplicate node', error.message);
    }
  }

  private async handleRenameNode(args: any): Promise<ToolResult> {
    if (!args.nodePath || !args.newName) {
      return this.createErrorResponse('nodePath and newName are required');
    }
    try {
      const result = await this.godotBridge.sendCommand('rename_node', {
        node_path: args.nodePath,
        new_name: args.newName,
      });
      return this.createSuccessResponse(`Node renamed to '${args.newName}'`, result);
    } catch (error: any) {
      return this.createErrorResponse('Failed to rename node', error.message);
    }
  }

  private async handleReparentNode(args: any): Promise<ToolResult> {
    if (!args.nodePath || !args.newParentPath) {
      return this.createErrorResponse('nodePath and newParentPath are required');
    }
    try {
      const result = await this.godotBridge.sendCommand('reparent_node', {
        node_path: args.nodePath,
        new_parent_path: args.newParentPath,
      });
      return this.createSuccessResponse(`Node reparented to '${args.newParentPath}'`, result);
    } catch (error: any) {
      return this.createErrorResponse('Failed to reparent node', error.message);
    }
  }

  private async handleRunProject(): Promise<ToolResult> {
    try {
      const result = await this.godotBridge.sendCommand('run_project');
      return this.createSuccessResponse('Project is running', result);
    } catch (error: any) {
      return this.createErrorResponse('Failed to run project', error.message);
    }
  }

  private async handleStopProject(): Promise<ToolResult> {
    try {
      const result = await this.godotBridge.sendCommand('stop_project');
      return this.createSuccessResponse('Project stopped', result);
    } catch (error: any) {
      return this.createErrorResponse('Failed to stop project', error.message);
    }
  }

  private async handleSaveScene(): Promise<ToolResult> {
    try {
      const result = await this.godotBridge.sendCommand('save_scene');
      return this.createSuccessResponse('Scene saved', result);
    } catch (error: any) {
      return this.createErrorResponse('Failed to save scene', error.message);
    }
  }

  private async handleSaveAllScenes(): Promise<ToolResult> {
    try {
      const result = await this.godotBridge.sendCommand('save_all_scenes');
      return this.createSuccessResponse('All scenes saved', result);
    } catch (error: any) {
      return this.createErrorResponse('Failed to save all scenes', error.message);
    }
  }

  private async handleImportAsset(args: any): Promise<ToolResult> {
    if (!args.sourcePath || !args.targetPath) {
      return this.createErrorResponse('sourcePath and targetPath are required');
    }
    try {
      const result = await this.godotBridge.sendCommand('import_asset', {
        source_path: args.sourcePath,
        target_path: args.targetPath,
      });
      return this.createSuccessResponse('Asset imported', result);
    } catch (error: any) {
      return this.createErrorResponse('Failed to import asset', error.message);
    }
  }

  private async handleGetResourceInfo(args: any): Promise<ToolResult> {
    if (!args.resourcePath) return this.createErrorResponse('resourcePath is required');
    try {
      const result = await this.godotBridge.sendCommand('get_resource_info', { resource_path: args.resourcePath });
      return this.createSuccessResponse('Resource info:', result);
    } catch (error: any) {
      return this.createErrorResponse('Failed to get resource info', error.message);
    }
  }

  private async handleCreateNewScene(args: any): Promise<ToolResult> {
    if (!args.scenePath) return this.createErrorResponse('scenePath is required');
    try {
      const result = await this.godotBridge.sendCommand('create_new_scene', { scene_path: args.scenePath });
      return this.createSuccessResponse('New scene created', result);
    } catch (error: any) {
      return this.createErrorResponse('Failed to create scene', error.message);
    }
  }

  private async handleSwitchScene(args: any): Promise<ToolResult> {
    if (!args.scenePath) return this.createErrorResponse('scenePath is required');
    try {
      const result = await this.godotBridge.sendCommand('switch_scene', { scene_path: args.scenePath });
      return this.createSuccessResponse('Scene switched', result);
    } catch (error: any) {
      return this.createErrorResponse('Failed to switch scene', error.message);
    }
  }

  private async handleGetOpenScenes(): Promise<ToolResult> {
    try {
      const result = await this.godotBridge.sendCommand('get_open_scenes');
      return this.createSuccessResponse('Open scenes:', result);
    } catch (error: any) {
      return this.createErrorResponse('Failed to get open scenes', error.message);
    }
  }

  private async handleGetDebugOutput(): Promise<ToolResult> {
    try {
      const result = await this.godotBridge.sendCommand('get_debug_output');
      return this.createSuccessResponse('Debug output:', result);
    } catch (error: any) {
      return this.createErrorResponse('Failed to get debug output', error.message);
    }
  }

  private async handleCaptureScreenshot(args: any): Promise<ToolResult> {
    if (!args.outputPath) return this.createErrorResponse('outputPath is required');
    try {
      const result = await this.godotBridge.sendCommand('capture_screenshot', { output_path: args.outputPath });
      return this.createSuccessResponse('Screenshot captured', result);
    } catch (error: any) {
      return this.createErrorResponse('Failed to capture screenshot', error.message);
    }
  }

  private async handleGetPerformanceStats(): Promise<ToolResult> {
    try {
      const result = await this.godotBridge.sendCommand('get_performance_stats');
      return this.createSuccessResponse('Performance stats:', result);
    } catch (error: any) {
      return this.createErrorResponse('Failed to get performance stats', error.message);
    }
  }

  private async handleGetProjectFiles(args: any): Promise<ToolResult> {
    try {
      const result = await this.godotBridge.sendCommand('get_project_files', { directory: args.directory || 'res://' });
      return this.createSuccessResponse('Project files:', result);
    } catch (error: any) {
      return this.createErrorResponse('Failed to get project files', error.message);
    }
  }

  private async handleGetProjectStats(): Promise<ToolResult> {
    try {
      const result = await this.godotBridge.sendCommand('get_project_stats');
      return this.createSuccessResponse('Project stats:', result);
    } catch (error: any) {
      return this.createErrorResponse('Failed to get project stats', error.message);
    }
  }

  private async handleCheckCodeQuality(args: any): Promise<ToolResult> {
    if (!args.scriptPath) return this.createErrorResponse('scriptPath is required');
    try {
      const result = await this.godotBridge.sendCommand('check_code_quality', { script_path: args.scriptPath });
      return this.createSuccessResponse('Code quality check:', result);
    } catch (error: any) {
      return this.createErrorResponse('Failed to check code quality', error.message);
    }
  }

  private async handleSearchInFiles(args: any): Promise<ToolResult> {
    if (!args.searchPattern) return this.createErrorResponse('searchPattern is required');
    try {
      const result = await this.godotBridge.sendCommand('search_in_files', {
        search_pattern: args.searchPattern,
        directory: args.directory || 'res://',
        file_extensions: args.fileExtensions || ['.gd'],
      });
      return this.createSuccessResponse('Search results:', result);
    } catch (error: any) {
      return this.createErrorResponse('Failed to search in files', error.message);
    }
  }

  private async handleReplaceInFiles(args: any): Promise<ToolResult> {
    if (!args.searchPattern || args.replaceText === undefined) {
      return this.createErrorResponse('searchPattern and replaceText are required');
    }
    try {
      const result = await this.godotBridge.sendCommand('replace_in_files', {
        search_pattern: args.searchPattern,
        replace_text: args.replaceText,
        directory: args.directory || 'res://',
        file_extensions: args.fileExtensions || ['.gd'],
      });
      return this.createSuccessResponse('Replace completed', result);
    } catch (error: any) {
      return this.createErrorResponse('Failed to replace in files', error.message);
    }
  }

  private async handleBatchSetProperty(args: any): Promise<ToolResult> {
    if (!args.nodePaths || !args.property || args.value === undefined) {
      return this.createErrorResponse('nodePaths, property, and value are required');
    }
    try {
      const result = await this.godotBridge.sendCommand('batch_set_property', {
        node_paths: args.nodePaths,
        property: args.property,
        value: args.value,
      });
      return this.createSuccessResponse('Batch property set completed', result);
    } catch (error: any) {
      return this.createErrorResponse('Failed to batch set property', error.message);
    }
  }

  private async handleGetOperationLog(): Promise<ToolResult> {
    try {
      const result = await this.godotBridge.sendCommand('get_operation_log');
      return this.createSuccessResponse('Operation log:', result);
    } catch (error: any) {
      return this.createErrorResponse('Failed to get operation log', error.message);
    }
  }

  // ============================================================================
  // Server Start
  // ============================================================================

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('Trae Godot MCP server v2.1.0 running on stdio');
    console.error('Waiting for Godot Editor connection...');
  }
}

// ============================================================================
// Main Entry Point
// ============================================================================

const server = new TraeGodotServer();
server.run().catch(console.error);
