#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import dotenv from 'dotenv';
import winston from 'winston';
import { BrocadeSSHClient } from '../lib/ssh-client.js';
import { BrocadeCommandExecutor } from '../lib/brocade-commands.js';
import { BrocadeConfig } from '../types/index.js';

dotenv.config();

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'brocade-mcp.log' }),
  ],
});

const brocadeConfig: BrocadeConfig = {
  host: process.env.BROCADE_HOST ?? 'localhost',
  port: parseInt(process.env.BROCADE_PORT ?? '22'),
  username: process.env.BROCADE_USERNAME ?? 'admin',
  password: process.env.BROCADE_PASSWORD ?? '',
  timeout: parseInt(process.env.SSH_TIMEOUT ?? '30000'),
  keepaliveInterval: parseInt(process.env.SSH_KEEPALIVE_INTERVAL ?? '10000'),
};

const sshClient = new BrocadeSSHClient(brocadeConfig, logger);
const commandExecutor = new BrocadeCommandExecutor(sshClient);

const server = new Server(
  {
    name: 'brocade-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  },
);

const GetSystemInfoSchema = z.object({});

const GetVlansSchema = z.object({});

const GetInterfacesSchema = z.object({});

const GetMacTableSchema = z.object({});

const GetRoutingTableSchema = z.object({});

const ConfigureVlanSchema = z.object({
  vlanId: z.number().min(1).max(4094),
  name: z.string().optional(),
});

const AddPortToVlanSchema = z.object({
  port: z.string(),
  vlanId: z.number().min(1).max(4094),
  tagged: z.boolean().optional(),
});

const ConfigureInterfaceSchema = z.object({
  interfaceName: z.string(),
  description: z.string().optional(),
  enabled: z.boolean().optional(),
  speed: z.string().optional(),
  duplex: z.string().optional(),
});

const ExecuteCommandSchema = z.object({
  command: z.string(),
});

const tools: Tool[] = [
  {
    name: 'get_system_info',
    description: 'Get system information from the Brocade switch',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_vlans',
    description: 'Get all VLANs configured on the switch',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_interfaces',
    description: 'Get all interfaces and their status',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_mac_table',
    description: 'Get the MAC address table',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_routing_table',
    description: 'Get the IP routing table',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'configure_vlan',
    description: 'Create or configure a VLAN',
    inputSchema: {
      type: 'object',
      properties: {
        vlanId: { type: 'number', minimum: 1, maximum: 4094 },
        name: { type: 'string' },
      },
      required: ['vlanId'],
    },
  },
  {
    name: 'add_port_to_vlan',
    description: 'Add a port to a VLAN (tagged or untagged)',
    inputSchema: {
      type: 'object',
      properties: {
        port: { type: 'string' },
        vlanId: { type: 'number', minimum: 1, maximum: 4094 },
        tagged: { type: 'boolean' },
      },
      required: ['port', 'vlanId'],
    },
  },
  {
    name: 'configure_interface',
    description: 'Configure interface settings',
    inputSchema: {
      type: 'object',
      properties: {
        interfaceName: { type: 'string' },
        description: { type: 'string' },
        enabled: { type: 'boolean' },
        speed: { type: 'string' },
        duplex: { type: 'string' },
      },
      required: ['interfaceName'],
    },
  },
  {
    name: 'execute_command',
    description: 'Execute a raw CLI command on the switch',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string' },
      },
      required: ['command'],
    },
  },
];

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [
      {
        uri: 'brocade://system/info',
        name: 'System Information',
        description: 'Current system information and status',
      },
      {
        uri: 'brocade://config/vlans',
        name: 'VLAN Configuration',
        description: 'Current VLAN configuration',
      },
      {
        uri: 'brocade://status/interfaces',
        name: 'Interface Status',
        description: 'Current interface status and configuration',
      },
    ],
  };
});

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  try {
    switch (uri) {
    case 'brocade://system/info':
      const systemInfo = await commandExecutor.getSystemInfo();
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(systemInfo, null, 2),
          },
        ],
      };

    case 'brocade://config/vlans':
      const vlans = await commandExecutor.getVlans();
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(vlans, null, 2),
          },
        ],
      };

    case 'brocade://status/interfaces':
      const interfaces = await commandExecutor.getInterfaces();
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(interfaces, null, 2),
          },
        ],
      };

    default:
      throw new Error(`Unknown resource: ${uri}`);
    }
  } catch (error) {
    logger.error(`Failed to read resource ${uri}:`, error);
    throw error;
  }
});

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
    case 'get_system_info':
      const systemInfo = await commandExecutor.getSystemInfo();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(systemInfo, null, 2),
          },
        ],
      };

    case 'get_vlans':
      const vlans = await commandExecutor.getVlans();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(vlans, null, 2),
          },
        ],
      };

    case 'get_interfaces':
      const interfaces = await commandExecutor.getInterfaces();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(interfaces, null, 2),
          },
        ],
      };

    case 'get_mac_table':
      const macTable = await commandExecutor.getMacAddressTable();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(macTable, null, 2),
          },
        ],
      };

    case 'get_routing_table':
      const routes = await commandExecutor.getRoutingTable();
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(routes, null, 2),
          },
        ],
      };

    case 'configure_vlan':
      const vlanArgs = ConfigureVlanSchema.parse(args);
      await commandExecutor.configureVlan(vlanArgs.vlanId, vlanArgs.name);
      return {
        content: [
          {
            type: 'text',
            text: `VLAN ${vlanArgs.vlanId} configured successfully`,
          },
        ],
      };

    case 'add_port_to_vlan':
      const portArgs = AddPortToVlanSchema.parse(args);
      await commandExecutor.addPortToVlan(
        portArgs.port,
        portArgs.vlanId,
        portArgs.tagged,
      );
      return {
        content: [
          {
            type: 'text',
            text: `Port ${portArgs.port} added to VLAN ${portArgs.vlanId}`,
          },
        ],
      };

    case 'configure_interface':
      const ifaceArgs = ConfigureInterfaceSchema.parse(args);
      await commandExecutor.configureInterface(ifaceArgs.interfaceName, {
        description: ifaceArgs.description,
        enabled: ifaceArgs.enabled,
        speed: ifaceArgs.speed,
        duplex: ifaceArgs.duplex,
      });
      return {
        content: [
          {
            type: 'text',
            text: `Interface ${ifaceArgs.interfaceName} configured successfully`,
          },
        ],
      };

    case 'execute_command':
      const cmdArgs = ExecuteCommandSchema.parse(args);
      const output = await sshClient.executeCommand(cmdArgs.command);
      return {
        content: [
          {
            type: 'text',
            text: output,
          },
        ],
      };

    default:
      throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    logger.error(`Failed to execute tool ${name}:`, error);
    throw error;
  }
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('Brocade MCP stdio server started');
}

main().catch((error) => {
  logger.error('Server failed to start:', error);
  process.exit(1);
});