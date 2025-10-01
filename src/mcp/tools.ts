/**
 * MCP tool definitions for Brocade switch management
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { generateToolJsonSchemas, ToolName } from './schemas.js';

// Generate JSON schemas once
const JSON_SCHEMAS = generateToolJsonSchemas();

/**
 * Tool metadata definitions
 */
interface ToolMetadata {
  name: ToolName;
  description: string;
  category: 'info' | 'config' | 'vlan' | 'interface' | 'security' | 'maintenance';
  requiresPrivilege?: boolean;
}

const TOOLS_METADATA: ToolMetadata[] = [
  {
    name: 'get_system_info',
    description: 'Get system information including model, version, uptime, and hardware details',
    category: 'info',
  },
  {
    name: 'get_vlans',
    description: 'Get all VLANs configured on the switch with their names and port assignments',
    category: 'vlan',
  },
  {
    name: 'get_interfaces',
    description: 'Get all interfaces and their current status, speed, and configuration',
    category: 'interface',
  },
  {
    name: 'configure_vlan',
    description: 'Create or modify a VLAN configuration',
    category: 'vlan',
    requiresPrivilege: true,
  },
  {
    name: 'add_port_to_vlan',
    description: 'Add a port to a VLAN as tagged (trunk) or untagged (access)',
    category: 'vlan',
    requiresPrivilege: true,
  },
  {
    name: 'configure_interface',
    description: 'Configure interface settings including speed, duplex, and description',
    category: 'interface',
    requiresPrivilege: true,
  },
  {
    name: 'get_spanning_tree',
    description: 'Get spanning tree protocol status and configuration',
    category: 'info',
  },
  {
    name: 'configure_spanning_tree',
    description: 'Configure spanning tree protocol mode and settings',
    category: 'config',
    requiresPrivilege: true,
  },
  {
    name: 'backup_config',
    description: 'Backup the running or startup configuration',
    category: 'maintenance',
  },
  {
    name: 'save_config',
    description: 'Save the running configuration to startup configuration',
    category: 'maintenance',
    requiresPrivilege: true,
  },
  {
    name: 'configure_port_security',
    description: 'Configure port security settings to limit MAC addresses',
    category: 'security',
    requiresPrivilege: true,
  },
  {
    name: 'monitor_interface',
    description: 'Monitor interface statistics in real-time (SSE transport only)',
    category: 'interface',
  },
  {
    name: 'execute_command',
    description: 'Execute a raw CLI command on the switch (use with caution)',
    category: 'maintenance',
    requiresPrivilege: true,
  },
];

/**
 * Generate MCP tool definitions
 */
export function generateTools(transportType: 'stdio' | 'sse' = 'stdio'): Tool[] {
  // Filter out monitor_interface for stdio transport
  const metadata = transportType === 'stdio'
    ? TOOLS_METADATA.filter(t => t.name !== 'monitor_interface')
    : TOOLS_METADATA;

  return metadata.map(meta => ({
    name: meta.name,
    description: meta.description,
    inputSchema: {
      type: 'object',
      ...JSON_SCHEMAS[meta.name],
    },
  }));
}

/**
 * Get all available tool names for a transport type
 */
export function getToolNames(transportType: 'stdio' | 'sse' = 'stdio'): ToolName[] {
  const tools = generateTools(transportType);
  return tools.map(t => t.name as ToolName);
}

/**
 * Check if a tool requires elevated privileges
 */
export function requiresPrivilege(toolName: ToolName): boolean {
  const meta = TOOLS_METADATA.find(t => t.name === toolName);
  return meta?.requiresPrivilege ?? false;
}

/**
 * Get tool category
 */
export function getToolCategory(toolName: ToolName): string {
  const meta = TOOLS_METADATA.find(t => t.name === toolName);
  return meta?.category ?? 'unknown';
}