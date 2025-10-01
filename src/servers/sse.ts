#!/usr/bin/env node
/**
 * SSE MCP Server for Brocade ICX 6450 switch management
 * Provides real-time monitoring and web integration
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import express from 'express';
import cors from 'cors';
import { setupHandlers } from '../mcp/handlers.js';
import { initializeClients, validateEnvironment } from '../core/config.js';
import { logInfo, logError } from '../core/logger.js';

/**
 * Interface monitoring state
 */
interface MonitoringSession {
  interfaceName: string;
  interval: number;
  timer?: NodeJS.Timeout;
  transport: SSEServerTransport;
}

/**
 * Main server initialization
 */
async function main() {
  try {
    // Validate environment variables
    validateEnvironment();

    // Initialize clients and configuration
    const { sshClient, commandExecutor, logger, serverConfig } = initializeClients('sse');

    // Create Express app
    const app = express();

    // Configure middleware
    app.use(cors({
      origin: serverConfig.sseCorsOrigin || '*',
    }));
    app.use(express.json());

    // Active monitoring sessions
    const monitoringSessions = new Map<string, MonitoringSession>();

    // Health check endpoint
    app.get('/health', async (req, res) => {
      const isHealthy = await sshClient.healthCheck();
      const stats = sshClient.getStats();

      res.json({
        status: isHealthy ? 'healthy' : 'unhealthy',
        server: {
          name: serverConfig.name,
          version: serverConfig.version,
        },
        ssh: stats,
        monitoring: {
          activeSessions: monitoringSessions.size,
        },
      });
    });

    // SSE endpoint
    app.get('/sse', async (req, res) => {
      logInfo(logger, 'New SSE connection established');

      // Set SSE headers
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // Disable Nginx buffering
      });

      // Create SSE transport
      const transport = new SSEServerTransport(`/sse`, res);

      // Create MCP server for this connection
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

      // Setup shared handlers with SSE-specific extensions
      setupHandlers(server, {
        sshClient,
        commandExecutor,
        logger,
        transportType: 'sse',
      });

      // Handle server errors
      server.onerror = (error) => {
        logError(logger, error, { transport: 'sse' });
      };

      // Handle transport closure
      transport.onclose = async () => {
        logInfo(logger, 'SSE transport closed');

        // Clean up any monitoring sessions for this transport
        for (const [id, session] of monitoringSessions) {
          if (session.transport === transport) {
            if (session.timer) {
              clearInterval(session.timer);
            }
            monitoringSessions.delete(id);
            logInfo(logger, 'Stopped monitoring session', { sessionId: id });
          }
        }
      };

      // Connect the server
      await server.connect(transport);

      // Keep connection alive with periodic pings
      const pingInterval = setInterval(() => {
        res.write('event: ping\ndata: {}\n\n');
      }, 30000); // Every 30 seconds

      // Clean up on client disconnect
      req.on('close', () => {
        clearInterval(pingInterval);
        transport.close();
      });
    });

    // POST endpoint for sending messages (optional, for non-SSE clients)
    app.post('/messages', express.json(), async (_req, res) => {
      try {
        // For POST /messages, create a simple response
        // The actual MCP protocol communication happens through SSE
        res.json({
          success: true,
          message: 'Use the SSE endpoint /sse for MCP protocol communication',
        });
      } catch (error) {
        logError(logger, error, { endpoint: '/messages' });
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Internal server error',
        });
      }
    });

    // Interface monitoring endpoint (SSE-specific feature)
    app.post('/monitor/start', express.json(), async (req, res) => {
      try {
        const { interfaceName, interval = 5, sessionId } = req.body;

        if (!interfaceName || !sessionId) {
          return res.status(400).json({ error: 'interfaceName and sessionId are required' });
        }

        // Check if session already exists
        if (monitoringSessions.has(sessionId)) {
          return res.status(409).json({ error: 'Monitoring session already exists' });
        }

        logInfo(logger, 'Starting interface monitoring', {
          interfaceName,
          interval,
          sessionId,
        });

        // This would need to be connected to an active SSE transport
        // For now, we'll just acknowledge the request
        res.json({
          message: 'Monitoring session created',
          sessionId,
          interfaceName,
          interval,
        });
      } catch (error) {
        logError(logger, error, { endpoint: '/monitor/start' });
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Failed to start monitoring',
        });
      }
    });

    // Stop monitoring endpoint
    app.post('/monitor/stop', express.json(), async (req, res) => {
      try {
        const { sessionId } = req.body;

        if (!sessionId) {
          return res.status(400).json({ error: 'sessionId is required' });
        }

        const session = monitoringSessions.get(sessionId);
        if (!session) {
          return res.status(404).json({ error: 'Monitoring session not found' });
        }

        if (session.timer) {
          clearInterval(session.timer);
        }
        monitoringSessions.delete(sessionId);

        logInfo(logger, 'Stopped monitoring session', { sessionId });

        res.json({
          message: 'Monitoring session stopped',
          sessionId,
        });
      } catch (error) {
        logError(logger, error, { endpoint: '/monitor/stop' });
        res.status(500).json({
          error: error instanceof Error ? error.message : 'Failed to stop monitoring',
        });
      }
    });

    // Start the Express server
    const port = serverConfig.ssePort || 3000;
    const server = app.listen(port, () => {
      logInfo(logger, 'Brocade MCP SSE server started', {
        name: serverConfig.name,
        version: serverConfig.version,
        port,
        corsOrigin: serverConfig.sseCorsOrigin,
      });
      console.log(`SSE server running at http://localhost:${port}`);
      console.log(`SSE endpoint: http://localhost:${port}/sse`);
      console.log(`Health check: http://localhost:${port}/health`);
    });

    // Handle graceful shutdown
    const shutdown = async () => {
      logInfo(logger, 'Shutting down SSE server');

      // Stop all monitoring sessions
      for (const [_id, session] of monitoringSessions) {
        if (session.timer) {
          clearInterval(session.timer);
        }
      }
      monitoringSessions.clear();

      // Disconnect SSH client
      sshClient.disconnect();

      // Close the server
      server.close(() => {
        logInfo(logger, 'SSE server shut down');
        process.exit(0);
      });
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (error) {
    console.error('Failed to start SSE server:', error);
    process.exit(1);
  }
}

// Start the server
main();