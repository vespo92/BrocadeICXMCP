/**
 * Zod schemas for MCP tool inputs
 * Automatically generates JSON schemas for MCP tool definitions
 */

import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

// Tool input schemas
export const ConfigureVlanSchema = z.object({
  vlanId: z.number().min(1).max(4094).describe('VLAN ID (1-4094)'),
  name: z.string().optional().describe('Optional VLAN name'),
});

export const AddPortToVlanSchema = z.object({
  port: z.string().describe('Port identifier (e.g., "1/1/1")'),
  vlanId: z.number().min(1).max(4094).describe('VLAN ID (1-4094)'),
  tagged: z.boolean().optional().describe('Whether the port should be tagged (trunk) or untagged (access)'),
});

export const ConfigureInterfaceSchema = z.object({
  interfaceName: z.string().describe('Interface name (e.g., "ethernet 1/1/1")'),
  description: z.string().optional().describe('Interface description'),
  enabled: z.boolean().optional().describe('Enable or disable the interface'),
  speed: z.string().optional().describe('Interface speed (e.g., "auto", "1000-full")'),
  duplex: z.string().optional().describe('Duplex mode (e.g., "auto", "full", "half")'),
});

export const ExecuteCommandSchema = z.object({
  command: z.string().describe('CLI command to execute on the switch'),
});

export const MonitorInterfaceSchema = z.object({
  interfaceName: z.string().describe('Interface name to monitor'),
  interval: z.number().min(1).max(60).optional().describe('Monitoring interval in seconds (1-60)'),
});

export const GetInterfaceSchema = z.object({
  interfaceName: z.string().optional().describe('Optional specific interface name to get details for'),
});

export const GetVlanSchema = z.object({
  vlanId: z.number().min(1).max(4094).optional().describe('Optional specific VLAN ID to get details for'),
});

export const ConfigureSpanningTreeSchema = z.object({
  mode: z.enum(['rstp', 'stp', 'mstp']).describe('Spanning Tree Protocol mode'),
  priority: z.number().min(0).max(61440).optional().describe('Bridge priority (0-61440, in increments of 4096)'),
});

export const BackupConfigSchema = z.object({
  format: z.enum(['running', 'startup']).optional().describe('Configuration type to backup'),
});

export const ConfigurePortSecuritySchema = z.object({
  port: z.string().describe('Port identifier'),
  maxMacAddresses: z.number().min(1).max(10).describe('Maximum MAC addresses allowed'),
  violation: z.enum(['shutdown', 'restrict', 'protect']).describe('Action on violation'),
});

// LLDP schemas
export const ConfigureLLDPSchema = z.object({
  enabled: z.boolean().optional().describe('Enable or disable LLDP'),
  transmitInterval: z.number().min(5).max(32768).optional().describe('LLDP transmit interval in seconds'),
  holdMultiplier: z.number().min(2).max(10).optional().describe('LLDP hold time multiplier'),
});

// Layer 2-3 schemas
export const ConfigureStaticRouteSchema = z.object({
  destination: z.string().describe('Destination network (e.g., "192.168.1.0")'),
  netmask: z.string().describe('Network mask (e.g., "255.255.255.0")'),
  gateway: z.string().describe('Gateway IP address'),
  distance: z.number().min(1).max(255).optional().describe('Administrative distance'),
  interface: z.string().optional().describe('Exit interface'),
});

export const ConfigurePortChannelSchema = z.object({
  id: z.number().min(1).max(256).describe('Port channel ID'),
  ports: z.array(z.string()).describe('Array of port identifiers to include in the channel'),
  type: z.enum(['static', 'lacp']).optional().describe('Port channel type'),
  name: z.string().optional().describe('Port channel name'),
});

export const ConfigureLayer3InterfaceSchema = z.object({
  vlan: z.number().min(1).max(4094).describe('VLAN ID for the Layer 3 interface'),
  ipAddress: z.string().describe('IP address'),
  subnet: z.string().describe('Subnet mask in CIDR notation (e.g., "24")'),
  description: z.string().optional().describe('Interface description'),
});

export const ConfigureQoSSchema = z.object({
  name: z.string().describe('QoS profile name'),
  priority: z.number().min(0).max(7).optional().describe('Priority level (0-7)'),
  dscp: z.number().min(0).max(63).optional().describe('DSCP value (0-63)'),
  cos: z.number().min(0).max(7).optional().describe('Class of Service value (0-7)'),
  queueId: z.number().min(0).max(7).optional().describe('Queue ID (0-7)'),
});

// ACL/Firewall schemas
export const ACLRuleSchema = z.object({
  action: z.enum(['permit', 'deny']).describe('Action to take'),
  protocol: z.string().describe('Protocol (ip, tcp, udp, icmp, etc.)'),
  sourceIp: z.string().optional().describe('Source IP address'),
  sourceWildcard: z.string().optional().describe('Source wildcard mask'),
  destIp: z.string().optional().describe('Destination IP address'),
  destWildcard: z.string().optional().describe('Destination wildcard mask'),
  sourcePort: z.string().optional().describe('Source port or range'),
  destPort: z.string().optional().describe('Destination port or range'),
  description: z.string().optional().describe('Rule description'),
});

export const ConfigureACLSchema = z.object({
  name: z.string().describe('ACL name'),
  type: z.enum(['standard', 'extended']).describe('ACL type'),
  rules: z.array(ACLRuleSchema).describe('Array of ACL rules'),
});

// Switch Stacking schemas
export const GetStackMemberSchema = z.object({
  unitId: z.number().min(1).max(12).describe('Stack unit ID (1-12)'),
});

export const ConfigureStackPrioritySchema = z.object({
  unitId: z.number().min(1).max(12).describe('Stack unit ID (1-12)'),
  priority: z.number().min(0).max(255).describe('Priority value (0-255, higher is better)'),
});

export const ConfigureStackPortsSchema = z.object({
  unitId: z.number().min(1).max(12).describe('Stack unit ID (1-12)'),
  port1: z.string().describe('First stack port identifier'),
  port2: z.string().optional().describe('Second stack port identifier (for redundancy)'),
});

export const RenumberStackUnitSchema = z.object({
  currentId: z.number().min(1).max(12).describe('Current unit ID'),
  newId: z.number().min(1).max(12).describe('New unit ID'),
});

export const ConfigureStackSchema = z.object({
  enabled: z.boolean().describe('Enable or disable stack'),
});

// Security Feature schemas
export const ConfigureDHCPSnoopingSchema = z.object({
  vlan: z.number().min(1).max(4094).describe('VLAN ID'),
  enabled: z.boolean().describe('Enable or disable DHCP snooping'),
  trustPorts: z.array(z.string()).optional().describe('Array of trusted port identifiers'),
});

export const ConfigureIPSourceGuardSchema = z.object({
  port: z.string().describe('Port identifier'),
  enabled: z.boolean().describe('Enable or disable IP source guard'),
  maxBindings: z.number().min(1).max(10).optional().describe('Maximum IP bindings'),
});

export const ConfigureDynamicARPInspectionSchema = z.object({
  vlan: z.number().min(1).max(4094).describe('VLAN ID'),
  enabled: z.boolean().describe('Enable or disable DAI'),
  trustPorts: z.array(z.string()).optional().describe('Array of trusted port identifiers'),
  validateSrcMac: z.boolean().optional().describe('Validate source MAC address'),
  validateDstMac: z.boolean().optional().describe('Validate destination MAC address'),
  validateIp: z.boolean().optional().describe('Validate IP address'),
});

export const GetPortSecurityStatusSchema = z.object({
  port: z.string().optional().describe('Optional specific port identifier'),
});

// Advanced Monitoring schemas
export const GetInterfaceStatisticsSchema = z.object({
  interfaceName: z.string().optional().describe('Optional specific interface name'),
});

export const RunCableDiagnosticsSchema = z.object({
  port: z.string().describe('Port identifier for cable diagnostics'),
});

export const GetOpticalModuleInfoSchema = z.object({
  port: z.string().optional().describe('Optional specific port identifier'),
});

// Performance / batch operation schemas
export const ExecuteBatchSchema = z.object({
  commands: z.array(z.string()).min(1).describe('Array of CLI commands to execute in order'),
});

export const PasteConfigSchema = z.object({
  config: z.string().describe('Multi-line configuration block (one command per line, lines starting with ! are ignored)'),
  save: z.boolean().optional().default(false).describe('Run "write memory" after applying config (default: false)'),
});

export const CreateVlanFullSchema = z.object({
  id: z.number().min(1).max(4094).describe('VLAN ID (1-4094)'),
  name: z.string().describe('VLAN name'),
  taggedPorts: z.array(z.string()).optional().describe('Array of tagged (trunk) port identifiers (e.g., ["ethernet 1/1/1", "ethernet 2/1/1"])'),
  untaggedPorts: z.array(z.string()).optional().describe('Array of untagged (access) port identifiers'),
});

// Type exports
export type ConfigureVlanInput = z.infer<typeof ConfigureVlanSchema>;
export type AddPortToVlanInput = z.infer<typeof AddPortToVlanSchema>;
export type ConfigureInterfaceInput = z.infer<typeof ConfigureInterfaceSchema>;
export type ExecuteCommandInput = z.infer<typeof ExecuteCommandSchema>;
export type MonitorInterfaceInput = z.infer<typeof MonitorInterfaceSchema>;
export type GetInterfaceInput = z.infer<typeof GetInterfaceSchema>;
export type GetVlanInput = z.infer<typeof GetVlanSchema>;
export type ConfigureSpanningTreeInput = z.infer<typeof ConfigureSpanningTreeSchema>;
export type BackupConfigInput = z.infer<typeof BackupConfigSchema>;
export type ConfigurePortSecurityInput = z.infer<typeof ConfigurePortSecuritySchema>;
export type ConfigureLLDPInput = z.infer<typeof ConfigureLLDPSchema>;
export type ConfigureStaticRouteInput = z.infer<typeof ConfigureStaticRouteSchema>;
export type ConfigurePortChannelInput = z.infer<typeof ConfigurePortChannelSchema>;
export type ConfigureLayer3InterfaceInput = z.infer<typeof ConfigureLayer3InterfaceSchema>;
export type ConfigureQoSInput = z.infer<typeof ConfigureQoSSchema>;
export type ACLRuleInput = z.infer<typeof ACLRuleSchema>;
export type ConfigureACLInput = z.infer<typeof ConfigureACLSchema>;
export type GetStackMemberInput = z.infer<typeof GetStackMemberSchema>;
export type ConfigureStackPriorityInput = z.infer<typeof ConfigureStackPrioritySchema>;
export type ConfigureStackPortsInput = z.infer<typeof ConfigureStackPortsSchema>;
export type RenumberStackUnitInput = z.infer<typeof RenumberStackUnitSchema>;
export type ConfigureStackInput = z.infer<typeof ConfigureStackSchema>;
export type ConfigureDHCPSnoopingInput = z.infer<typeof ConfigureDHCPSnoopingSchema>;
export type ConfigureIPSourceGuardInput = z.infer<typeof ConfigureIPSourceGuardSchema>;
export type ConfigureDynamicARPInspectionInput = z.infer<typeof ConfigureDynamicARPInspectionSchema>;
export type GetPortSecurityStatusInput = z.infer<typeof GetPortSecurityStatusSchema>;
export type GetInterfaceStatisticsInput = z.infer<typeof GetInterfaceStatisticsSchema>;
export type RunCableDiagnosticsInput = z.infer<typeof RunCableDiagnosticsSchema>;
export type GetOpticalModuleInfoInput = z.infer<typeof GetOpticalModuleInfoSchema>;
export type ExecuteBatchInput = z.infer<typeof ExecuteBatchSchema>;
export type PasteConfigInput = z.infer<typeof PasteConfigSchema>;
export type CreateVlanFullInput = z.infer<typeof CreateVlanFullSchema>;

// Schema map for easy access
export const TOOL_SCHEMAS = {
  // Existing tools
  configure_vlan: ConfigureVlanSchema,
  add_port_to_vlan: AddPortToVlanSchema,
  configure_interface: ConfigureInterfaceSchema,
  execute_command: ExecuteCommandSchema,
  monitor_interface: MonitorInterfaceSchema,
  get_interfaces: GetInterfaceSchema,
  get_vlans: GetVlanSchema,
  get_system_info: z.object({}),
  get_spanning_tree: z.object({}),
  configure_spanning_tree: ConfigureSpanningTreeSchema,
  backup_config: BackupConfigSchema,
  save_config: z.object({}),
  configure_port_security: ConfigurePortSecuritySchema,

  // LLDP tools
  get_lldp_neighbors: z.object({}),
  get_network_topology: z.object({}),
  configure_lldp: ConfigureLLDPSchema,

  // Layer 2-3 tools
  get_arp_table: z.object({}),
  get_port_channels: z.object({}),
  get_layer3_interfaces: z.object({}),
  configure_static_route: ConfigureStaticRouteSchema,
  configure_port_channel: ConfigurePortChannelSchema,
  configure_layer3_interface: ConfigureLayer3InterfaceSchema,
  configure_qos: ConfigureQoSSchema,

  // Routing protocol tools
  get_bgp_neighbors: z.object({}),
  get_ospf_neighbors: z.object({}),
  get_routing_protocol_status: z.object({}),

  // ACL/Firewall tools
  get_acls: z.object({}),
  configure_acl: ConfigureACLSchema,
  get_upstream_routing: z.object({}),

  // Switch Stacking tools
  get_stack_topology: z.object({}),
  get_stack_ports: z.object({}),
  get_stack_member: GetStackMemberSchema,
  get_stack_health: z.object({}),
  configure_stack_priority: ConfigureStackPrioritySchema,
  configure_stack_ports: ConfigureStackPortsSchema,
  renumber_stack_unit: RenumberStackUnitSchema,
  configure_stack: ConfigureStackSchema,

  // Security Feature tools
  configure_dhcp_snooping: ConfigureDHCPSnoopingSchema,
  get_dhcp_bindings: z.object({}),
  configure_ip_source_guard: ConfigureIPSourceGuardSchema,
  configure_dynamic_arp_inspection: ConfigureDynamicARPInspectionSchema,
  get_port_security_status: GetPortSecurityStatusSchema,

  // Advanced Monitoring tools
  get_interface_statistics: GetInterfaceStatisticsSchema,
  get_system_health: z.object({}),
  run_cable_diagnostics: RunCableDiagnosticsSchema,
  get_optical_module_info: GetOpticalModuleInfoSchema,

  // Performance / batch operation tools
  execute_batch: ExecuteBatchSchema,
  paste_config: PasteConfigSchema,
  create_vlan_full: CreateVlanFullSchema,
} as const;

// Export type for tool names
export type ToolName = keyof typeof TOOL_SCHEMAS;

/**
 * Convert a Zod schema to JSON Schema for MCP tool definitions
 */
export function toJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const jsonSchema = zodToJsonSchema(schema, {
    target: 'openApi3',
    $refStrategy: 'none',
  });

  // Remove $schema property that zod-to-json-schema adds
  if (typeof jsonSchema === 'object' && jsonSchema !== null && '$schema' in jsonSchema) {
    const { $schema: _$schema, ...rest } = jsonSchema as Record<string, unknown> & { $schema?: string };
    return rest;
  }

  return jsonSchema as Record<string, unknown>;
}

/**
 * Generate JSON schemas for all tools
 */
export function generateToolJsonSchemas(): Record<ToolName, Record<string, unknown>> {
  const schemas: Partial<Record<ToolName, Record<string, unknown>>> = {};

  for (const [name, schema] of Object.entries(TOOL_SCHEMAS)) {
    schemas[name as ToolName] = toJsonSchema(schema);
  }

  return schemas as Record<ToolName, Record<string, unknown>>;
}