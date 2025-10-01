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

// Schema map for easy access
export const TOOL_SCHEMAS = {
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