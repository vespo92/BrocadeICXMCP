/**
 * Configuration management with Zod validation
 */

import { z } from 'zod';
import dotenv from 'dotenv';
import winston from 'winston';
import { ConfigurationError } from './errors.js';
import { BrocadeSSHClient } from '../lib/ssh-client.js';
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
    const config = BrocadeConfigSchema.parse({
      host: process.env.BROCADE_HOST,
      port: process.env.BROCADE_PORT ? parseInt(process.env.BROCADE_PORT, 10) : 22,
      username: process.env.BROCADE_USERNAME,
      password: process.env.BROCADE_PASSWORD,
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
 * Container for initialized clients
 */
export interface InitializedClients {
  sshClient: BrocadeSSHClient;
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

  // Initialize SSH client with logger
  const sshClient = new BrocadeSSHClient(brocadeConfig, logger);

  // Initialize command executor
  const commandExecutor = new BrocadeCommandExecutor(sshClient);

  return {
    sshClient,
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
  const required = ['BROCADE_HOST', 'BROCADE_USERNAME', 'BROCADE_PASSWORD'];
  const missing = required.filter(key => !process.env[key]);

  if (missing.length > 0) {
    throw new ConfigurationError(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }
}