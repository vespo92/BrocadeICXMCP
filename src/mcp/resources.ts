/**
 * MCP resource definitions for Brocade switch information
 */

import { Resource } from '@modelcontextprotocol/sdk/types.js';
import { BrocadeCommandExecutor } from '../lib/brocade-commands.js';

/**
 * Resource types available
 */
export type ResourceType = 'config' | 'vlans' | 'interfaces' | 'system' | 'logs';

/**
 * Resource URI patterns
 */
export const RESOURCE_URI_PATTERNS = {
  config: 'brocade://config/{type}',
  vlans: 'brocade://vlans',
  interfaces: 'brocade://interfaces',
  system: 'brocade://system/info',
  logs: 'brocade://logs/{level}',
} as const;

/**
 * Generate resource definitions
 */
export function generateResources(): Resource[] {
  return [
    {
      uri: 'brocade://config/running',
      name: 'Running Configuration',
      description: 'Current running configuration of the switch',
      mimeType: 'text/plain',
    },
    {
      uri: 'brocade://config/startup',
      name: 'Startup Configuration',
      description: 'Startup configuration that will be loaded on reboot',
      mimeType: 'text/plain',
    },
    {
      uri: 'brocade://vlans',
      name: 'VLAN Configuration',
      description: 'All VLANs configured on the switch',
      mimeType: 'application/json',
    },
    {
      uri: 'brocade://interfaces',
      name: 'Interface Status',
      description: 'Status and configuration of all interfaces',
      mimeType: 'application/json',
    },
    {
      uri: 'brocade://system/info',
      name: 'System Information',
      description: 'System details including model, version, and uptime',
      mimeType: 'application/json',
    },
    {
      uri: 'brocade://logs/recent',
      name: 'Recent Logs',
      description: 'Recent system log entries',
      mimeType: 'text/plain',
    },
  ];
}

/**
 * Read a resource by URI
 */
export async function readResource(
  uri: string,
  commandExecutor: BrocadeCommandExecutor
): Promise<{ contents: Array<{ text: string; uri: string; mimeType?: string }> }> {
  const contents: Array<{ text: string; uri: string; mimeType?: string }> = [];

  switch (uri) {
    case 'brocade://config/running': {
      const config = await commandExecutor.getRunningConfig();
      contents.push({
        uri,
        text: config,
        mimeType: 'text/plain',
      });
      break;
    }

    case 'brocade://config/startup': {
      const config = await commandExecutor.getStartupConfig();
      contents.push({
        uri,
        text: config,
        mimeType: 'text/plain',
      });
      break;
    }

    case 'brocade://vlans': {
      const vlans = await commandExecutor.getVlans();
      contents.push({
        uri,
        text: JSON.stringify(vlans, null, 2),
        mimeType: 'application/json',
      });
      break;
    }

    case 'brocade://interfaces': {
      const interfaces = await commandExecutor.getInterfaces();
      contents.push({
        uri,
        text: JSON.stringify(interfaces, null, 2),
        mimeType: 'application/json',
      });
      break;
    }

    case 'brocade://system/info': {
      const systemInfo = await commandExecutor.getSystemInfo();
      contents.push({
        uri,
        text: JSON.stringify(systemInfo, null, 2),
        mimeType: 'application/json',
      });
      break;
    }

    case 'brocade://logs/recent': {
      const logs = await commandExecutor.getLogs(100); // Get last 100 log entries
      contents.push({
        uri,
        text: logs,
        mimeType: 'text/plain',
      });
      break;
    }

    default:
      throw new Error(`Unknown resource URI: ${uri}`);
  }

  return { contents };
}

/**
 * Parse resource type from URI
 */
export function parseResourceUri(uri: string): {
  type: ResourceType;
  subtype?: string;
} | null {
  const patterns = {
    config: /^brocade:\/\/config\/(.+)$/,
    vlans: /^brocade:\/\/vlans$/,
    interfaces: /^brocade:\/\/interfaces$/,
    system: /^brocade:\/\/system\/(.+)$/,
    logs: /^brocade:\/\/logs\/(.+)$/,
  };

  for (const [type, pattern] of Object.entries(patterns)) {
    const match = uri.match(pattern);
    if (match) {
      return {
        type: type as ResourceType,
        subtype: match[1],
      };
    }
  }

  return null;
}