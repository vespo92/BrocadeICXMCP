/**
 * Configuration management with Zod validation
 */

import { z } from 'zod';
import dotenv from 'dotenv';
import winston from 'winston';
import { ConfigurationError } from './errors.js';
import { BrocadeSSHClient } from '../lib/ssh-client.js';
import { BrocadeTelnetClient } from '../lib/telnet-client.js';
import { BrocadeTransport } from '../lib/transport-interface.js';
import { BrocadeCommandExecutor } from '../lib/brocade-commands.js';

// Load environment variables
dotenv.config();

/**
 * Brocade configuration schema
 */
export const BrocadeConfigSchema = z.object({
  host: z.string().min(1, 'Host is required'),
  port: z.number().min(1).max(65535).default(22),
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
  transport: z.enum(['ssh', 'telnet']).default('ssh'),
  enablePassword: z.string().optional(),
  timeout: z.number().min(1000).default(30000),
  keepaliveInterval: z.number().min(1000).default(10000),
  maxRetries: z.number().min(0).default(3),
  retryDelay: z.number().min(100).default(1000),
});

export type BrocadeConfig = z.infer<typeof BrocadeConfigSchema>;

/**
 * Server configuration schema
 */
export const ServerConfigSchema = z.object({
  name: z.string().default('brocade-mcp-server'),
  version: z.string().default('1.0.0'),
  logLevel: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  logFile: z.string().optional(),
  ssePort: z.number().min(1).max(65535).default(3000),
  sseCorsOrigin: z.string().default('*'),
});

export type ServerConfig = z.infer<typeof ServerConfigSchema>;

/**
 * Load and validate Brocade configuration from environment
 */
export function loadBrocadeConfig(): BrocadeConfig {
  try {
    // Debug: log enable password env var presence
    const enablePwEnv = process.env.BROCADE_ENABLE_PASSWORD;
    if (enablePwEnv) {
      // eslint-disable-next-line no-console
      console.error(`[config] BROCADE_ENABLE_PASSWORD is set (length=${enablePwEnv.length})`);
    } else {
      // eslint-disable-next-line no-console
      console.error('[config] BROCADE_ENABLE_PASSWORD is NOT set');
    }

    const transport = (process.env.BROCADE_TRANSPORT || 'ssh') as 'ssh' | 'telnet';

    // Auto-default port: 23 for telnet, 22 for ssh
    const defaultPort = transport === 'telnet' ? 23 : 22;
    const port = process.env.BROCADE_PORT
      ? parseInt(process.env.BROCADE_PORT, 10)
      : defaultPort;

    const config = BrocadeConfigSchema.parse({
      host: process.env.BROCADE_HOST,
      port,
      username: process.env.BROCADE_USERNAME,
      password: process.env.BROCADE_PASSWORD,
      transport,
      enablePassword: process.env.BROCADE_ENABLE_PASSWORD ?? undefined,
      timeout: process.env.SSH_TIMEOUT ? parseInt(process.env.SSH_TIMEOUT, 10) : 30000,
      keepaliveInterval: process.env.SSH_KEEPALIVE_INTERVAL ? parseInt(process.env.SSH_KEEPALIVE_INTERVAL, 10) : 10000,
      maxRetries: process.env.SSH_MAX_RETRIES ? parseInt(process.env.SSH_MAX_RETRIES, 10) : 3,
      retryDelay: process.env.SSH_RETRY_DELAY ? parseInt(process.env.SSH_RETRY_DELAY, 10) : 1000,
    });

    return config;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join(', ');
      throw new ConfigurationError(`Invalid configuration: ${issues}`, error.issues);
    }
    throw error;
  }
}

/**
 * Load and validate server configuration from environment
 */
export function loadServerConfig(): ServerConfig {
  try {
    const config = ServerConfigSchema.parse({
      name: process.env.MCP_SERVER_NAME,
      version: process.env.MCP_SERVER_VERSION,
      logLevel: process.env.LOG_LEVEL,
      logFile: process.env.LOG_FILE,
      ssePort: process.env.SSE_PORT ? parseInt(process.env.SSE_PORT, 10) : 3000,
      sseCorsOrigin: process.env.SSE_CORS_ORIGIN,
    });

    return config;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const issues = error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`).join(', ');
      throw new ConfigurationError(`Invalid server configuration: ${issues}`, error.issues);
    }
    throw error;
  }
}

/**
 * Create the appropriate transport client based on configuration
 */
export function createTransportClient(
  config: BrocadeConfig,
  logger: winston.Logger
): BrocadeTransport {
  if (config.transport === 'telnet') {
    logger.info('Using telnet transport', {
      host: config.host,
      port: config.port,
      hasEnablePassword: !!config.enablePassword,
      enablePasswordLength: config.enablePassword?.length ?? 0,
    });
    return new BrocadeTelnetClient(config, logger);
  }

  logger.info('Using SSH transport', { host: config.host, port: config.port });
  return new BrocadeSSHClient(config, logger);
}

/**
 * Container for initialized clients
 */
export interface InitializedClients {
  switchClient: BrocadeTransport;
  commandExecutor: BrocadeCommandExecutor;
  logger: winston.Logger;
  brocadeConfig: BrocadeConfig;
  serverConfig: ServerConfig;
}

/**
 * Initialize all required clients and services
 */
export function initializeClients(
  transportType: 'stdio' | 'sse' = 'stdio'
): InitializedClients {
  const serverConfig = loadServerConfig();
  const brocadeConfig = loadBrocadeConfig();

  // Create logger with transport-specific configuration
  const logger = createLogger(serverConfig, transportType);

  // Create the transport client (SSH or Telnet) based on config
  const switchClient = createTransportClient(brocadeConfig, logger);

  // Initialize command executor with the transport client
  const commandExecutor = new BrocadeCommandExecutor(switchClient);

  return {
    switchClient,
    commandExecutor,
    logger,
    brocadeConfig,
    serverConfig,
  };
}

/**
 * Create a Winston logger instance
 */
export function createLogger(
  config: ServerConfig,
  transportType: 'stdio' | 'sse' = 'stdio'
): winston.Logger {
  const transports: winston.transport[] = [];

  // Always add file transport if logFile is specified
  if (config.logFile) {
    transports.push(new winston.transports.File({
      filename: config.logFile,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    }));
  } else {
    // Default file transport
    const filename = transportType === 'sse'
      ? 'brocade-mcp-sse.log'
      : 'brocade-mcp.log';

    transports.push(new winston.transports.File({
      filename,
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    }));
  }

  // Add console transport for SSE server
  if (transportType === 'sse') {
    transports.push(new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }));
  }

  return winston.createLogger({
    level: config.logLevel,
    format: winston.format.json(),
    transports,
  });
}

/**
 * Validate environment variables on startup
 */
export function validateEnvironment(): void {
  const transport = process.env.BROCADE_TRANSPORT || 'ssh';

  // Telnet connections may not need username/password (open access)
  if (transport === 'telnet') {
    const required = ['BROCADE_HOST'];
    const missing = required.filter(key => !process.env[key]);
    if (missing.length > 0) {
      throw new ConfigurationError(
        `Missing required environment variables: ${missing.join(', ')}`
      );
    }
    // Default username/password to empty for telnet if not set
    if (!process.env.BROCADE_USERNAME) process.env.BROCADE_USERNAME = 'admin';
    if (!process.env.BROCADE_PASSWORD) process.env.BROCADE_PASSWORD = 'none';
  } else {
    const required = ['BROCADE_HOST', 'BROCADE_USERNAME', 'BROCADE_PASSWORD'];
    const missing = required.filter(key => !process.env[key]);
    if (missing.length > 0) {
      throw new ConfigurationError(
        `Missing required environment variables: ${missing.join(', ')}`
      );
    }
  }
}
