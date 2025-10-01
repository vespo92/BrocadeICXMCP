#!/usr/bin/env node
/**
 * Stdio MCP Server for Brocade ICX 6450 switch management
 * Provides command-line integration for MCP clients
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { setupHandlers } from '../mcp/handlers.js';
import { initializeClients, validateEnvironment } from '../core/config.js';
import { logInfo, logError } from '../core/logger.js';

/**
 * Main server initialization
 */
async function main() {
  try {
    // Validate environment variables
    validateEnvironment();

    // Initialize clients and configuration
    const { sshClient, commandExecutor, logger, serverConfig } = initializeClients('stdio');

    // Create MCP server
    const server = new Server(
      {
        name: serverConfig.name,
        version: serverConfig.version,
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    // Setup shared handlers
    setupHandlers(server, {
      sshClient,
      commandExecutor,
      logger,
      transportType: 'stdio',
    });

    // Create stdio transport
    const transport = new StdioServerTransport();

    // Handle server errors
    server.onerror = (error) => {
      logError(logger, error, { transport: 'stdio' });
    };

    // Handle transport closure
    transport.onclose = async () => {
      logInfo(logger, 'Stdio transport closed, disconnecting SSH client');
      sshClient.disconnect();
    };

    // Start the server
    logInfo(logger, 'Starting Brocade MCP stdio server', {
      name: serverConfig.name,
      version: serverConfig.version,
    });

    await server.connect(transport);

    logInfo(logger, 'Brocade MCP stdio server started successfully');
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Handle process termination
process.on('SIGINT', () => {
  process.exit(0);
});

process.on('SIGTERM', () => {
  process.exit(0);
});

// Start the server
main();