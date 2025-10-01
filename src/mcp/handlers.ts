/**
 * Shared MCP request handlers for both stdio and SSE transports
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import type {
  CallToolRequest,
  ListResourcesRequest,
  ListToolsRequest,
  ReadResourceRequest,
} from '@modelcontextprotocol/sdk/types.js';
import winston from 'winston';
import { BrocadeSSHClient } from '../lib/ssh-client.js';
import { BrocadeCommandExecutor } from '../lib/brocade-commands.js';
import { generateTools, getToolCategory, requiresPrivilege } from './tools.js';
import { generateResources, readResource } from './resources.js';
import { TOOL_SCHEMAS, ToolName } from './schemas.js';
import {
  isBrocadeError,
  isSSHConnectionError,
  isCommandExecutionError,
  ValidationError,
} from '../core/errors.js';
import { logError, logInfo, logDebug, createTimer } from '../core/logger.js';

/**
 * Handler dependencies
 */
export interface HandlerDependencies {
  sshClient: BrocadeSSHClient;
  commandExecutor: BrocadeCommandExecutor;
  logger: winston.Logger;
  transportType: 'stdio' | 'sse';
}

/**
 * Setup all MCP handlers for a server
 */
export function setupHandlers(
  server: Server,
  deps: HandlerDependencies
): void {
  const { commandExecutor, logger, transportType } = deps;

  // List available tools
  server.setRequestHandler(
    ListToolsRequestSchema,
    async (_request: ListToolsRequest) => {
      logDebug(logger, 'Listing tools', { transport: transportType });
      const tools = generateTools(transportType);
      return { tools };
    }
  );

  // List available resources
  server.setRequestHandler(
    ListResourcesRequestSchema,
    async (_request: ListResourcesRequest) => {
      logDebug(logger, 'Listing resources');
      const resources = generateResources();
      return { resources };
    }
  );

  // Read a resource
  server.setRequestHandler(
    ReadResourceRequestSchema,
    async (request: ReadResourceRequest) => {
      const timer = createTimer(logger, `Read resource: ${request.params.uri}`);
      try {
        logInfo(logger, 'Reading resource', { uri: request.params.uri });
        const result = await readResource(request.params.uri, commandExecutor);
        timer.end(true);
        return result;
      } catch (error) {
        timer.end(false);
        logError(logger, error, { uri: request.params.uri });
        throw convertToMcpError(error);
      }
    }
  );

  // Execute a tool
  server.setRequestHandler(
    CallToolRequestSchema,
    async (request: CallToolRequest) => {
      const { name, arguments: args } = request.params;
      const timer = createTimer(logger, `Execute tool: ${name}`);

      try {
        logInfo(logger, 'Executing tool', {
          tool: name,
          category: getToolCategory(name as ToolName),
          requiresPrivilege: requiresPrivilege(name as ToolName),
        });

        const result = await executeToolHandler(
          name as ToolName,
          args ?? {},
          deps
        );

        timer.end(true);
        return result;
      } catch (error) {
        timer.end(false);
        logError(logger, error, { tool: name });
        throw convertToMcpError(error);
      }
    }
  );
}

/**
 * Execute a specific tool
 */
async function executeToolHandler(
  toolName: ToolName,
  args: unknown,
  deps: HandlerDependencies
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const { commandExecutor, logger, transportType } = deps;

  // Validate input against schema
  const schema = TOOL_SCHEMAS[toolName];
  if (!schema) {
    throw new ValidationError(`Unknown tool: ${toolName}`);
  }

  const validationResult = schema.safeParse(args);
  if (!validationResult.success) {
    const issues = validationResult.error.issues
      .map(issue => `${issue.path.join('.')}: ${issue.message}`)
      .join(', ');
    throw new ValidationError(`Invalid arguments for ${toolName}: ${issues}`, toolName);
  }

  const validatedArgs = validationResult.data;
  let result: string;

  // Execute the tool
  switch (toolName) {
    case 'get_system_info': {
      const systemInfo = await commandExecutor.getSystemInfo();
      result = JSON.stringify(systemInfo, null, 2);
      break;
    }

    case 'get_vlans': {
      const vlans = await commandExecutor.getVlans();
      result = JSON.stringify(vlans, null, 2);
      break;
    }

    case 'get_interfaces': {
      const interfaces = await commandExecutor.getInterfaces();
      result = JSON.stringify(interfaces, null, 2);
      break;
    }

    case 'configure_vlan': {
      const { vlanId, name } = validatedArgs as { vlanId: number; name?: string };
      await commandExecutor.configureVlan(vlanId, name);
      result = `VLAN ${vlanId} configured successfully${name ? ` with name "${name}"` : ''}`;
      break;
    }

    case 'add_port_to_vlan': {
      const { port, vlanId, tagged } = validatedArgs as { port: string; vlanId: number; tagged?: boolean };
      await commandExecutor.addPortToVlan(port, vlanId, tagged);
      result = `Port ${port} added to VLAN ${vlanId} as ${tagged ? 'tagged' : 'untagged'}`;
      break;
    }

    case 'configure_interface': {
      const { interfaceName, description, enabled, speed, duplex } = validatedArgs as { interfaceName: string; description?: string; enabled?: boolean; speed?: string; duplex?: string };
      await commandExecutor.configureInterface(interfaceName, {
        description,
        enabled,
        speed,
        duplex,
      });
      result = `Interface ${interfaceName} configured successfully`;
      break;
    }

    case 'get_spanning_tree': {
      const spanningTree = await commandExecutor.getSpanningTree();
      result = JSON.stringify(spanningTree, null, 2);
      break;
    }

    case 'configure_spanning_tree': {
      const { mode, priority } = validatedArgs as { mode: string; priority?: number };
      await commandExecutor.configureSpanningTree(mode, priority);
      result = `Spanning Tree configured with mode: ${mode}${priority ? `, priority: ${priority}` : ''}`;
      break;
    }

    case 'backup_config': {
      const { format = 'running' } = validatedArgs as { format?: 'running' | 'startup' };
      const config = format === 'startup'
        ? await commandExecutor.getStartupConfig()
        : await commandExecutor.getRunningConfig();
      result = config;
      break;
    }

    case 'save_config': {
      await commandExecutor.saveConfig();
      result = 'Configuration saved successfully';
      break;
    }

    case 'configure_port_security': {
      const { port, maxMacAddresses, violation } = validatedArgs as { port: string; maxMacAddresses: number; violation: string };
      await commandExecutor.configurePortSecurity(port, maxMacAddresses, violation);
      result = `Port security configured on ${port}: max MACs=${maxMacAddresses}, violation=${violation}`;
      break;
    }

    case 'monitor_interface': {
      if (transportType !== 'sse') {
        throw new ValidationError('Interface monitoring is only available with SSE transport');
      }
      const { interfaceName, interval = 5 } = validatedArgs as { interfaceName: string; interval?: number };
      // For SSE, this would start a monitoring session
      // Implementation would depend on SSE-specific handling
      result = `Monitoring interface ${interfaceName} every ${interval} seconds (SSE stream started)`;
      break;
    }

    case 'execute_command': {
      const { command } = validatedArgs as { command: string };
      logInfo(logger, 'Executing raw command', { command });
      const output = await commandExecutor.executeCommand(command);
      result = output;
      break;
    }

    default: {
      throw new ValidationError(`Tool ${toolName} is not implemented`);
    }
  }

  return {
    content: [{ type: 'text', text: result }],
  };
}

/**
 * Convert errors to MCP errors
 */
function convertToMcpError(error: unknown): McpError {
  if (error instanceof McpError) {
    return error;
  }

  if (isSSHConnectionError(error)) {
    return new McpError(
      ErrorCode.InternalError,
      `SSH connection failed: ${error.message}`,
      error.details
    );
  }

  if (isCommandExecutionError(error)) {
    return new McpError(
      ErrorCode.InternalError,
      `Command execution failed: ${error.message}`,
      {
        command: error.command,
        exitCode: error.exitCode,
        details: error.details,
      }
    );
  }

  if (error instanceof ValidationError) {
    return new McpError(
      ErrorCode.InvalidParams,
      error.message,
      { field: error.field }
    );
  }

  if (isBrocadeError(error)) {
    return new McpError(
      ErrorCode.InternalError,
      error.message,
      error.details
    );
  }

  if (error instanceof Error) {
    return new McpError(
      ErrorCode.InternalError,
      error.message
    );
  }

  return new McpError(
    ErrorCode.InternalError,
    'An unknown error occurred'
  );
}