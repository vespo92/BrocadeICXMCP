#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import express from 'express';
import cors from 'cors';
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
    new winston.transports.File({ filename: 'brocade-mcp-sse.log' }),
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

const brocadeConfig: BrocadeConfig = {
  host: process.env.BROCADE_HOST || 'localhost',
  port: parseInt(process.env.BROCADE_PORT || '22'),
  username: process.env.BROCADE_USERNAME || 'admin',
  password: process.env.BROCADE_PASSWORD || '',
  timeout: parseInt(process.env.SSH_TIMEOUT || '30000'),
  keepaliveInterval: parseInt(process.env.SSH_KEEPALIVE_INTERVAL || '10000'),
};

const sshClient = new BrocadeSSHClient(brocadeConfig, logger);
const commandExecutor = new BrocadeCommandExecutor(sshClient);

const server = new Server(
  {
    name: 'brocade-mcp-sse-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  }
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

const MonitorInterfaceSchema = z.object({
  interfaceName: z.string(),
  interval: z.number().min(1).max(60).optional(),
});

const tools: Tool[] = [
  {
    name: 'get_system_info',
    description: 'Get system information from the Brocade switch',
    inputSchema: GetSystemInfoSchema,
  },
  {
    name: 'get_vlans',
    description: 'Get all VLANs configured on the switch',
    inputSchema: GetVlansSchema,
  },
  {
    name: 'get_interfaces',
    description: 'Get all interfaces and their status',
    inputSchema: GetInterfacesSchema,
  },
  {
    name: 'get_mac_table',
    description: 'Get the MAC address table',
    inputSchema: GetMacTableSchema,
  },
  {
    name: 'get_routing_table',
    description: 'Get the IP routing table',
    inputSchema: GetRoutingTableSchema,
  },
  {
    name: 'configure_vlan',
    description: 'Create or configure a VLAN',
    inputSchema: ConfigureVlanSchema,
  },
  {
    name: 'add_port_to_vlan',
    description: 'Add a port to a VLAN (tagged or untagged)',
    inputSchema: AddPortToVlanSchema,
  },
  {
    name: 'configure_interface',
    description: 'Configure interface settings',
    inputSchema: ConfigureInterfaceSchema,
  },
  {
    name: 'execute_command',
    description: 'Execute a raw CLI command on the switch',
    inputSchema: ExecuteCommandSchema,
  },
  {
    name: 'monitor_interface',
    description: 'Monitor interface statistics in real-time (SSE only)',
    inputSchema: MonitorInterfaceSchema,
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
      {
        uri: 'brocade://status/mac-table',
        name: 'MAC Address Table',
        description: 'Current MAC address table',
      },
      {
        uri: 'brocade://config/routes',
        name: 'Routing Table',
        description: 'Current IP routing table',
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

      case 'brocade://status/mac-table':
        const macTable = await commandExecutor.getMacAddressTable();
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(macTable, null, 2),
            },
          ],
        };

      case 'brocade://config/routes':
        const routes = await commandExecutor.getRoutingTable();
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify(routes, null, 2),
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

const monitoringIntervals = new Map<string, NodeJS.Timeout>();

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
          portArgs.tagged
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

      case 'monitor_interface':
        const monitorArgs = MonitorInterfaceSchema.parse(args);
        const intervalSeconds = monitorArgs.interval || 5;
        
        if (monitoringIntervals.has(monitorArgs.interfaceName)) {
          clearInterval(monitoringIntervals.get(monitorArgs.interfaceName)!);
          monitoringIntervals.delete(monitorArgs.interfaceName);
          return {
            content: [
              {
                type: 'text',
                text: `Stopped monitoring interface ${monitorArgs.interfaceName}`,
              },
            ],
          };
        }

        const monitorInterval = setInterval(async () => {
          try {
            const stats = await sshClient.executeCommand(
              `show statistics ${monitorArgs.interfaceName}`
            );
            logger.info(`Interface ${monitorArgs.interfaceName} stats:`, stats);
          } catch (error) {
            logger.error(`Failed to get stats for ${monitorArgs.interfaceName}:`, error);
          }
        }, intervalSeconds * 1000);

        monitoringIntervals.set(monitorArgs.interfaceName, monitorInterval);

        return {
          content: [
            {
              type: 'text',
              text: `Started monitoring interface ${monitorArgs.interfaceName} every ${intervalSeconds} seconds`,
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

async function main() {
  const app = express();
  const PORT = parseInt(process.env.SSE_PORT || '3000');

  app.use(cors());
  
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', name: 'brocade-mcp-sse-server' });
  });

  const transport = new SSEServerTransport('/messages', '/response');
  await transport.connect(server);

  app.use(transport.router);

  app.listen(PORT, () => {
    logger.info(`Brocade MCP SSE server started on port ${PORT}`);
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`SSE endpoint: http://localhost:${PORT}/messages`);
  });
}

main().catch((error) => {
  logger.error('Server failed to start:', error);
  process.exit(1);
});