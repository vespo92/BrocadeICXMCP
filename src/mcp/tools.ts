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
  category: 'info' | 'config' | 'vlan' | 'interface' | 'security' | 'maintenance' | 'lldp' | 'routing' | 'layer3' | 'acl' | 'stack' | 'monitoring' | 'diagnostics';
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

  // LLDP tools
  {
    name: 'get_lldp_neighbors',
    description: 'Get LLDP neighbors for network topology discovery',
    category: 'lldp',
  },
  {
    name: 'get_network_topology',
    description: 'Get complete network topology based on LLDP data',
    category: 'lldp',
  },
  {
    name: 'configure_lldp',
    description: 'Configure LLDP settings (enable/disable, timers)',
    category: 'lldp',
    requiresPrivilege: true,
  },

  // Layer 2-3 tools
  {
    name: 'get_arp_table',
    description: 'Get ARP table showing IP to MAC address mappings',
    category: 'layer3',
  },
  {
    name: 'get_port_channels',
    description: 'Get port channel (LAG) configurations and status',
    category: 'interface',
  },
  {
    name: 'get_layer3_interfaces',
    description: 'Get Layer 3 interfaces (VEs) with IP configuration',
    category: 'layer3',
  },
  {
    name: 'configure_static_route',
    description: 'Configure static routing entries',
    category: 'routing',
    requiresPrivilege: true,
  },
  {
    name: 'configure_port_channel',
    description: 'Configure port channel (LAG) with LACP or static mode',
    category: 'interface',
    requiresPrivilege: true,
  },
  {
    name: 'configure_layer3_interface',
    description: 'Configure Layer 3 interface (VE) with IP addressing',
    category: 'layer3',
    requiresPrivilege: true,
  },
  {
    name: 'configure_qos',
    description: 'Configure Quality of Service (QoS) settings',
    category: 'config',
    requiresPrivilege: true,
  },

  // Routing protocol tools
  {
    name: 'get_bgp_neighbors',
    description: 'Get BGP neighbor status and information',
    category: 'routing',
  },
  {
    name: 'get_ospf_neighbors',
    description: 'Get OSPF neighbor status and information',
    category: 'routing',
  },
  {
    name: 'get_routing_protocol_status',
    description: 'Get overall routing protocol status (BGP, OSPF)',
    category: 'routing',
  },

  // ACL/Firewall tools
  {
    name: 'get_acls',
    description: 'Get all configured Access Control Lists (ACLs)',
    category: 'acl',
  },
  {
    name: 'configure_acl',
    description: 'Configure Access Control List for firewall integration',
    category: 'acl',
    requiresPrivilege: true,
  },
  {
    name: 'get_upstream_routing',
    description: 'Get upstream routing information including default gateway, BGP/OSPF peers, and ACLs for firewall integration',
    category: 'routing',
  },

  // Switch Stacking tools
  {
    name: 'get_stack_topology',
    description: 'Get complete stack topology including all members, roles, and configuration',
    category: 'stack',
  },
  {
    name: 'get_stack_ports',
    description: 'Get stack port status and connections',
    category: 'stack',
  },
  {
    name: 'get_stack_member',
    description: 'Get detailed information about a specific stack member',
    category: 'stack',
  },
  {
    name: 'get_stack_health',
    description: 'Get comprehensive stack health including redundancy and connectivity status',
    category: 'stack',
  },
  {
    name: 'configure_stack_priority',
    description: 'Configure stack priority for master/backup election',
    category: 'stack',
    requiresPrivilege: true,
  },
  {
    name: 'configure_stack_ports',
    description: 'Configure stack ports for inter-switch connectivity',
    category: 'stack',
    requiresPrivilege: true,
  },
  {
    name: 'renumber_stack_unit',
    description: 'Renumber a stack unit ID',
    category: 'stack',
    requiresPrivilege: true,
  },
  {
    name: 'configure_stack',
    description: 'Enable or disable stack functionality',
    category: 'stack',
    requiresPrivilege: true,
  },

  // Security Feature tools
  {
    name: 'configure_dhcp_snooping',
    description: 'Configure DHCP snooping for VLAN security',
    category: 'security',
    requiresPrivilege: true,
  },
  {
    name: 'get_dhcp_bindings',
    description: 'Get DHCP snooping binding database',
    category: 'security',
  },
  {
    name: 'configure_ip_source_guard',
    description: 'Configure IP source guard to prevent IP spoofing',
    category: 'security',
    requiresPrivilege: true,
  },
  {
    name: 'configure_dynamic_arp_inspection',
    description: 'Configure Dynamic ARP Inspection (DAI) to prevent ARP poisoning',
    category: 'security',
    requiresPrivilege: true,
  },
  {
    name: 'get_port_security_status',
    description: 'Get detailed port security status and MAC address counts',
    category: 'security',
  },

  // Advanced Monitoring tools
  {
    name: 'get_interface_statistics',
    description: 'Get detailed interface statistics including packets, bytes, errors, and CRC',
    category: 'monitoring',
  },
  {
    name: 'get_system_health',
    description: 'Get comprehensive system health including CPU, memory, temperature, fans, and power supplies',
    category: 'monitoring',
  },
  {
    name: 'run_cable_diagnostics',
    description: 'Run cable diagnostics (TDR) to detect faults and cable length',
    category: 'diagnostics',
  },
  {
    name: 'get_optical_module_info',
    description: 'Get SFP/SFP+ optical module information including temperature and power levels',
    category: 'diagnostics',
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