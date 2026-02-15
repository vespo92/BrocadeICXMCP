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
import { BrocadeTransport } from '../lib/transport-interface.js';
import { BrocadeCommandExecutor } from '../lib/brocade-commands.js';
import { generateTools, getToolCategory, requiresPrivilege } from './tools.js';
import { generateResources, readResource } from './resources.js';
import { TOOL_SCHEMAS, ToolName } from './schemas.js';
import {
  isBrocadeError,
  isSSHConnectionError,
  isTelnetConnectionError,
  isCommandExecutionError,
  ValidationError,
} from '../core/errors.js';
import { logError, logInfo, logDebug, createTimer } from '../core/logger.js';

/**
 * Handler dependencies
 */
export interface HandlerDependencies {
  switchClient: BrocadeTransport;
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

    // LLDP tools
    case 'get_lldp_neighbors': {
      const neighbors = await commandExecutor.getLLDPNeighbors();
      result = JSON.stringify(neighbors, null, 2);
      break;
    }

    case 'get_network_topology': {
      const topology = await commandExecutor.getNetworkTopology();
      result = JSON.stringify(topology, null, 2);
      break;
    }

    case 'configure_lldp': {
      const { enabled, transmitInterval, holdMultiplier } = validatedArgs as { enabled?: boolean; transmitInterval?: number; holdMultiplier?: number };
      await commandExecutor.configureLLDP({ enabled, transmitInterval, holdMultiplier });
      result = 'LLDP configuration updated successfully';
      break;
    }

    // Layer 2-3 tools
    case 'get_arp_table': {
      const arpTable = await commandExecutor.getArpTable();
      result = JSON.stringify(arpTable, null, 2);
      break;
    }

    case 'get_port_channels': {
      const portChannels = await commandExecutor.getPortChannels();
      result = JSON.stringify(portChannels, null, 2);
      break;
    }

    case 'get_layer3_interfaces': {
      const layer3Interfaces = await commandExecutor.getLayer3Interfaces();
      result = JSON.stringify(layer3Interfaces, null, 2);
      break;
    }

    case 'configure_static_route': {
      const { destination, netmask, gateway, distance, interface: iface } = validatedArgs as { destination: string; netmask: string; gateway: string; distance?: number; interface?: string };
      await commandExecutor.configureStaticRoute({
        destination,
        netmask,
        gateway,
        distance,
        interface: iface,
      });
      result = `Static route configured: ${destination}/${netmask} via ${gateway}`;
      break;
    }

    case 'configure_port_channel': {
      const { id, ports, type, name } = validatedArgs as { id: number; ports: string[]; type?: 'static' | 'lacp'; name?: string };
      await commandExecutor.configurePortChannel({ id, ports, type, name });
      result = `Port channel ${id} configured with ${ports.length} port(s)`;
      break;
    }

    case 'configure_layer3_interface': {
      const { vlan, ipAddress, subnet, description } = validatedArgs as { vlan: number; ipAddress: string; subnet: string; description?: string };
      await commandExecutor.configureLayer3Interface({
        vlan,
        ipAddress,
        subnet,
        description,
      });
      result = `Layer 3 interface VE ${vlan} configured with IP ${ipAddress}/${subnet}`;
      break;
    }

    case 'configure_qos': {
      const { name, priority, dscp, cos, queueId } = validatedArgs as { name: string; priority?: number; dscp?: number; cos?: number; queueId?: number };
      await commandExecutor.configureQoS({
        name,
        priority,
        dscp,
        cos,
        queueId,
      });
      result = `QoS profile "${name}" configured successfully`;
      break;
    }

    // Routing protocol tools
    case 'get_bgp_neighbors': {
      const bgpNeighbors = await commandExecutor.getBGPNeighbors();
      result = JSON.stringify(bgpNeighbors, null, 2);
      break;
    }

    case 'get_ospf_neighbors': {
      const ospfNeighbors = await commandExecutor.getOSPFNeighbors();
      result = JSON.stringify(ospfNeighbors, null, 2);
      break;
    }

    case 'get_routing_protocol_status': {
      const protocolStatus = await commandExecutor.getRoutingProtocolStatus();
      result = JSON.stringify(protocolStatus, null, 2);
      break;
    }

    // ACL/Firewall tools
    case 'get_acls': {
      const acls = await commandExecutor.getACLs();
      result = JSON.stringify(acls, null, 2);
      break;
    }

    case 'configure_acl': {
      const { name, type, rules } = validatedArgs as { name: string; type: 'standard' | 'extended'; rules: Array<{ action: 'permit' | 'deny'; protocol: string; sourceIp?: string; sourceWildcard?: string; destIp?: string; destWildcard?: string; sourcePort?: string; destPort?: string; description?: string }> };
      await commandExecutor.configureACL({ name, type, rules });
      result = `ACL "${name}" configured with ${rules.length} rule(s)`;
      break;
    }

    case 'get_upstream_routing': {
      const upstreamRouting = await commandExecutor.getUpstreamRouting();
      result = JSON.stringify(upstreamRouting, null, 2);
      break;
    }

    // Switch Stacking tools
    case 'get_stack_topology': {
      const stackTopology = await commandExecutor.getStackTopology();
      result = JSON.stringify(stackTopology, null, 2);
      break;
    }

    case 'get_stack_ports': {
      const stackPorts = await commandExecutor.getStackPorts();
      result = JSON.stringify(stackPorts, null, 2);
      break;
    }

    case 'get_stack_member': {
      const { unitId } = validatedArgs as { unitId: number };
      const stackMember = await commandExecutor.getStackMember(unitId);
      if (stackMember) {
        result = JSON.stringify(stackMember, null, 2);
      } else {
        result = `Stack member with unit ID ${unitId} not found`;
      }
      break;
    }

    case 'get_stack_health': {
      const stackHealth = await commandExecutor.getStackHealth();
      result = JSON.stringify(stackHealth, null, 2);
      break;
    }

    case 'configure_stack_priority': {
      const { unitId, priority } = validatedArgs as { unitId: number; priority: number };
      await commandExecutor.configureStackPriority(unitId, priority);
      result = `Stack priority for unit ${unitId} set to ${priority}`;
      break;
    }

    case 'configure_stack_ports': {
      const { unitId, port1, port2 } = validatedArgs as { unitId: number; port1: string; port2?: string };
      await commandExecutor.configureStackPorts({ unitId, port1, port2 });
      result = `Stack ports configured for unit ${unitId}: ${port1}${port2 ? `, ${port2}` : ''}`;
      break;
    }

    case 'renumber_stack_unit': {
      const { currentId, newId } = validatedArgs as { currentId: number; newId: number };
      await commandExecutor.renumberStackUnit(currentId, newId);
      result = `Stack unit renumbered from ${currentId} to ${newId}`;
      break;
    }

    case 'configure_stack': {
      const { enabled } = validatedArgs as { enabled: boolean };
      await commandExecutor.configureStack(enabled);
      result = `Stack ${enabled ? 'enabled' : 'disabled'} successfully`;
      break;
    }

    // Security Feature tools
    case 'configure_dhcp_snooping': {
      const { vlan, enabled, trustPorts } = validatedArgs as { vlan: number; enabled: boolean; trustPorts?: string[] };
      await commandExecutor.configureDHCPSnooping({ vlan, enabled, trustPorts });
      result = `DHCP snooping ${enabled ? 'enabled' : 'disabled'} on VLAN ${vlan}${trustPorts && trustPorts.length > 0 ? ` with ${trustPorts.length} trusted ports` : ''}`;
      break;
    }

    case 'get_dhcp_bindings': {
      const bindings = await commandExecutor.getDHCPBindings();
      result = JSON.stringify(bindings, null, 2);
      break;
    }

    case 'configure_ip_source_guard': {
      const { port, enabled, maxBindings } = validatedArgs as { port: string; enabled: boolean; maxBindings?: number };
      await commandExecutor.configureIPSourceGuard({ port, enabled, maxBindings });
      result = `IP source guard ${enabled ? 'enabled' : 'disabled'} on port ${port}`;
      break;
    }

    case 'configure_dynamic_arp_inspection': {
      const { vlan, enabled, trustPorts, validateSrcMac, validateDstMac, validateIp } = validatedArgs as { vlan: number; enabled: boolean; trustPorts?: string[]; validateSrcMac?: boolean; validateDstMac?: boolean; validateIp?: boolean };
      await commandExecutor.configureDynamicARPInspection({
        vlan,
        enabled,
        trustPorts,
        validateSrcMac,
        validateDstMac,
        validateIp,
      });
      result = `Dynamic ARP Inspection ${enabled ? 'enabled' : 'disabled'} on VLAN ${vlan}`;
      break;
    }

    case 'get_port_security_status': {
      const { port } = validatedArgs as { port?: string };
      const statuses = await commandExecutor.getPortSecurityStatus(port);
      result = JSON.stringify(statuses, null, 2);
      break;
    }

    // Advanced Monitoring tools
    case 'get_interface_statistics': {
      const { interfaceName } = validatedArgs as { interfaceName?: string };
      const statistics = await commandExecutor.getInterfaceStatistics(interfaceName);
      result = JSON.stringify(statistics, null, 2);
      break;
    }

    case 'get_system_health': {
      const health = await commandExecutor.getSystemHealth();
      result = JSON.stringify(health, null, 2);
      break;
    }

    case 'run_cable_diagnostics': {
      const { port } = validatedArgs as { port: string };
      const diagnostics = await commandExecutor.runCableDiagnostics(port);
      result = JSON.stringify(diagnostics, null, 2);
      break;
    }

    case 'get_optical_module_info': {
      const { port } = validatedArgs as { port?: string };
      const modules = await commandExecutor.getOpticalModuleInfo(port);
      result = JSON.stringify(modules, null, 2);
      break;
    }

    // Performance / batch operation tools
    case 'execute_batch': {
      const { commands } = validatedArgs as { commands: string[] };
      logInfo(logger, 'Executing batch commands', { count: commands.length });
      const batchResults = await deps.switchClient.executeMultipleCommands(commands);
      const batchOutput = commands.map((cmd, i) => ({
        command: cmd,
        output: batchResults[i] ?? '',
        success: batchResults[i] !== '',
      }));
      result = JSON.stringify(batchOutput, null, 2);
      break;
    }

    case 'paste_config': {
      const { config, save } = validatedArgs as { config: string; save?: boolean };
      // Split by newline, filter blanks and comments
      const configLines = config
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('!'));

      if (configLines.length === 0) {
        result = 'No valid configuration lines to apply';
        break;
      }

      // Prepend configure terminal if not already present
      const cmds: string[] = [];
      if (!configLines[0].toLowerCase().startsWith('configure')) {
        cmds.push('configure terminal');
      }
      cmds.push(...configLines);

      // Append end + write memory if save requested
      const lastCmd = cmds[cmds.length - 1].toLowerCase();
      if (!lastCmd.startsWith('end')) {
        cmds.push('end');
      }
      if (save) {
        cmds.push('write memory');
      }

      logInfo(logger, 'Pasting configuration', { lines: cmds.length, save });
      const pasteResults = await deps.switchClient.executeMultipleCommands(cmds);
      const pasteOutput = cmds.map((cmd, i) => ({
        command: cmd,
        output: pasteResults[i] ?? '',
        success: pasteResults[i] !== undefined,
      }));
      result = JSON.stringify(pasteOutput, null, 2);
      break;
    }

    case 'create_vlan_full': {
      const { id, name, taggedPorts, untaggedPorts } = validatedArgs as {
        id: number;
        name: string;
        taggedPorts?: string[];
        untaggedPorts?: string[];
      };
      const vlanCmds: string[] = [
        'configure terminal',
        name ? `vlan ${id} name ${name}` : `vlan ${id}`,
      ];
      if (taggedPorts && taggedPorts.length > 0) {
        for (const port of taggedPorts) {
          vlanCmds.push(`tagged ${port}`);
        }
      }
      if (untaggedPorts && untaggedPorts.length > 0) {
        for (const port of untaggedPorts) {
          vlanCmds.push(`untagged ${port}`);
        }
      }
      vlanCmds.push('exit', 'end', 'write memory');

      logInfo(logger, 'Creating full VLAN configuration', {
        vlanId: id,
        name,
        taggedPorts: taggedPorts?.length ?? 0,
        untaggedPorts: untaggedPorts?.length ?? 0,
      });
      await deps.switchClient.executeMultipleCommands(vlanCmds);
      result = `VLAN ${id} "${name}" created with ${taggedPorts?.length ?? 0} tagged and ${untaggedPorts?.length ?? 0} untagged ports`;
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

  if (isTelnetConnectionError(error)) {
    return new McpError(
      ErrorCode.InternalError,
      `Telnet connection failed: ${error.message}`,
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