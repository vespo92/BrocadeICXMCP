/**
 * Enhanced SSH client with connection pooling, reconnection, and health checks
 */

import { Client, ClientChannel } from 'ssh2';
import winston from 'winston';
import { BrocadeConfig } from '../types/index.js';
import { BrocadeTransport } from './transport-interface.js';
import {
  SSHConnectionError,
  CommandExecutionError,
  TimeoutError,
  AuthenticationError,
} from '../core/errors.js';
import { logError, logInfo, logDebug, logWarn } from '../core/logger.js';

/**
 * Connection state enumeration
 */
enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error',
}

/**
 * SSH client with enhanced features
 */
export class BrocadeSSHClient implements BrocadeTransport {
  private client: Client | null = null;
  private config: BrocadeConfig;
  private logger: winston.Logger;
  private state: ConnectionState = ConnectionState.DISCONNECTED;
  private reconnectTimer?: NodeJS.Timeout;
  private keepaliveTimer?: NodeJS.Timeout;
  private lastActivity: number = Date.now();
  private connectionAttempts: number = 0;
  private readonly maxRetries: number;
  private readonly retryDelay: number;

  constructor(config: BrocadeConfig, logger: winston.Logger) {
    this.config = config;
    this.logger = logger;
    this.maxRetries = config.maxRetries ?? 3;
    this.retryDelay = config.retryDelay ?? 1000;
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Check if client is connected
   */
  isConnected(): boolean {
    return this.state === ConnectionState.CONNECTED && this.client !== null;
  }

  /**
   * Connect to the SSH server with retry logic
   */
  async connect(): Promise<void> {
    if (this.state === ConnectionState.CONNECTED) {
      logDebug(this.logger, 'Already connected');
      return;
    }

    if (this.state === ConnectionState.CONNECTING) {
      logDebug(this.logger, 'Connection already in progress');
      await this.waitForConnection();
      return;
    }

    this.state = ConnectionState.CONNECTING;
    this.connectionAttempts = 0;

    while (this.connectionAttempts < this.maxRetries) {
      try {
        await this.attemptConnection();
        this.startKeepalive();
        return;
      } catch (error) {
        this.connectionAttempts++;
        logWarn(this.logger, `Connection attempt ${this.connectionAttempts} failed`, {
          maxRetries: this.maxRetries,
          error: error instanceof Error ? error.message : String(error),
        });

        if (this.connectionAttempts >= this.maxRetries) {
          this.state = ConnectionState.ERROR;
          throw new SSHConnectionError(
            `Failed to connect after ${this.maxRetries} attempts`,
            { lastError: error }
          );
        }

        // Wait before retrying with exponential backoff
        const delay = this.retryDelay * Math.pow(2, this.connectionAttempts - 1);
        await this.sleep(delay);
      }
    }
  }

  /**
   * Attempt a single connection
   */
  private async attemptConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Clean up any existing client
      if (this.client) {
        this.client.removeAllListeners();
        this.client.end();
      }

      this.client = new Client();

      // Brocade switches use keyboard-interactive auth
      // Register handler before connection to respond to password prompts
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.client as any).on('keyboard-interactive', (
        _name: string,
        _instructions: string,
        _instructionsLang: string,
        prompts: Array<{ prompt: string; echo: boolean }>,
        finish: (responses: string[]) => void
      ) => {
        finish(prompts.map(() => this.config.password));
      });

      const connectionTimeout = setTimeout(() => {
        if (this.client) {
          this.client.end();
        }
        reject(new TimeoutError(
          'SSH connection timeout',
          this.config.timeout ?? 30000
        ));
      }, this.config.timeout ?? 30000);

      this.client
        .on('ready', () => {
          clearTimeout(connectionTimeout);
          this.state = ConnectionState.CONNECTED;
          this.connectionAttempts = 0;
          this.lastActivity = Date.now();
          logInfo(this.logger, 'SSH connection established', {
            host: this.config.host,
            port: this.config.port,
          });
          resolve();
        })
        .on('error', (err: Error) => {
          clearTimeout(connectionTimeout);
          this.state = ConnectionState.ERROR;

          // Check for authentication errors
          if (err.message.includes('authentication') || err.message.includes('password')) {
            reject(new AuthenticationError(
              'SSH authentication failed',
              { originalError: err.message }
            ));
          } else {
            reject(new SSHConnectionError(
              `SSH connection error: ${err.message}`,
              { originalError: err }
            ));
          }
        })
        .on('close', () => {
          clearTimeout(connectionTimeout);
          const wasConnected = this.state === ConnectionState.CONNECTED;
          this.state = ConnectionState.DISCONNECTED;
          logInfo(this.logger, 'SSH connection closed', { wasConnected });

          // Auto-reconnect if connection was established before
          if (wasConnected) {
            this.scheduleReconnect();
          }
        })
        .on('end', () => {
          clearTimeout(connectionTimeout);
          logDebug(this.logger, 'SSH connection ended');
        });

      // Attempt connection
      try {
        this.client.connect({
          host: this.config.host,
          port: this.config.port,
          username: this.config.username,
          password: this.config.password,
          tryKeyboard: true,
          keepaliveInterval: this.config.keepaliveInterval ?? 10000,
          keepaliveCountMax: 3,
          readyTimeout: this.config.timeout ?? 30000,
          algorithms: {
            kex: [
              'ecdh-sha2-nistp256',
              'ecdh-sha2-nistp384',
              'ecdh-sha2-nistp521',
              'diffie-hellman-group-exchange-sha256',
              'diffie-hellman-group14-sha256',
              'diffie-hellman-group14-sha1',
              'diffie-hellman-group-exchange-sha1',
              'diffie-hellman-group1-sha1',
            ],
            serverHostKey: [
              'ssh-rsa',
              'ssh-dss',
              'ecdsa-sha2-nistp256',
              'ecdsa-sha2-nistp384',
              'ecdsa-sha2-nistp521',
            ],
            cipher: [
              'aes128-ctr',
              'aes192-ctr',
              'aes256-ctr',
              'aes128-gcm@openssh.com',
              'aes256-gcm@openssh.com',
              'aes256-cbc',
              'aes192-cbc',
              'aes128-cbc',
              '3des-cbc',
            ],
          },
        });
      } catch (err) {
        clearTimeout(connectionTimeout);
        reject(err);
      }
    });
  }

  /**
   * Wait for an ongoing connection attempt
   */
  private async waitForConnection(): Promise<void> {
    const maxWait = 30000; // 30 seconds
    const checkInterval = 100; // 100ms
    let waited = 0;

    while (waited < maxWait) {
      if (this.state === ConnectionState.CONNECTED) {
        return;
      }
      if (this.state === ConnectionState.ERROR || this.state === ConnectionState.DISCONNECTED) {
        throw new SSHConnectionError('Connection failed while waiting');
      }
      await this.sleep(checkInterval);
      waited += checkInterval;
    }

    throw new TimeoutError('Timeout waiting for connection', maxWait);
  }

  /**
   * Schedule automatic reconnection
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    if (this.state === ConnectionState.RECONNECTING) {
      return;
    }

    this.state = ConnectionState.RECONNECTING;
    logInfo(this.logger, 'Scheduling reconnection', {
      delay: this.retryDelay,
    });

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        logError(this.logger, error, { context: 'auto-reconnect' });
        // Schedule another reconnect attempt
        this.scheduleReconnect();
      }
    }, this.retryDelay);
  }

  /**
   * Start keepalive monitoring
   */
  private startKeepalive(): void {
    this.stopKeepalive();

    const interval = this.config.keepaliveInterval ?? 10000;
    this.keepaliveTimer = setInterval(() => {
      const idleTime = Date.now() - this.lastActivity;

      // Send keepalive ping if idle for too long
      if (idleTime > interval && this.isConnected()) {
        this.sendKeepalive();
      }

      // Check for connection health
      if (idleTime > interval * 3 && this.isConnected()) {
        logWarn(this.logger, 'Connection appears stale, reconnecting', {
          idleTime,
        });
        this.reconnect();
      }
    }, interval);
  }

  /**
   * Stop keepalive monitoring
   */
  private stopKeepalive(): void {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = undefined;
    }
  }

  /**
   * Send a keepalive ping
   */
  private async sendKeepalive(): Promise<void> {
    try {
      // Execute a simple command to keep connection alive
      await this.executeCommand('echo keepalive', 1000);
      this.lastActivity = Date.now();
    } catch (error) {
      logDebug(this.logger, 'Keepalive failed', { error });
    }
  }

  /**
   * Execute a command with timeout
   */
  async executeCommand(command: string, timeout?: number): Promise<string> {
    // Ensure we're connected
    if (!this.isConnected()) {
      await this.connect();
    }

    if (!this.client) {
      throw new SSHConnectionError('Client is null after connection');
    }

    const effectiveTimeout = timeout ?? this.config.timeout ?? 30000;

    return new Promise((resolve, reject) => {
      const commandTimeout = setTimeout(() => {
        reject(new TimeoutError(
          `Command timeout: ${command}`,
          effectiveTimeout
        ));
      }, effectiveTimeout);

      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      this.client!.exec(command, (err: Error | undefined, stream: ClientChannel) => {
        if (err) {
          clearTimeout(commandTimeout);
          logError(this.logger, err, { command });
          reject(new CommandExecutionError(
            `Failed to execute command: ${err.message}`,
            command,
            undefined,
            err
          ));
          return;
        }

        let output = '';
        let errorOutput = '';

        stream
          .on('close', (code: number | null) => {
            clearTimeout(commandTimeout);
            this.lastActivity = Date.now();

            if (code !== null && code !== 0) {
              reject(new CommandExecutionError(
                `Command failed with exit code ${code}`,
                command,
                code,
                { stderr: errorOutput }
              ));
            } else {
              logDebug(this.logger, 'Command executed successfully', {
                command,
                outputLength: output.length,
              });
              resolve(output);
            }
          })
          .on('data', (data: Buffer) => {
            output += data.toString();
          })
          .stderr.on('data', (data: Buffer) => {
            errorOutput += data.toString();
          });
      });
    });
  }

  /**
   * Execute multiple commands in sequence
   */
  async executeMultipleCommands(commands: string[], timeout?: number): Promise<string[]> {
    const results: string[] = [];

    for (const command of commands) {
      try {
        const result = await this.executeCommand(command, timeout);
        results.push(result);
      } catch (error) {
        // Log error but continue with other commands
        logError(this.logger, error, { command, index: results.length });
        results.push(''); // Add empty result for failed command
      }
    }

    return results;
  }

  /**
   * Execute command with retries
   */
  async executeCommandWithRetry(
    command: string,
    maxAttempts: number = 3,
    timeout?: number
  ): Promise<string> {
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await this.executeCommand(command, timeout);
      } catch (error) {
        lastError = error;
        logWarn(this.logger, `Command attempt ${attempt} failed`, {
          command,
          attempt,
          maxAttempts,
          error: error instanceof Error ? error.message : String(error),
        });

        if (attempt < maxAttempts) {
          // Wait before retrying
          await this.sleep(this.retryDelay * attempt);

          // Reconnect if it's a connection error
          if (error instanceof SSHConnectionError || error instanceof TimeoutError) {
            await this.reconnect();
          }
        }
      }
    }

    throw new CommandExecutionError(
      `Command failed after ${maxAttempts} attempts`,
      command,
      undefined,
      lastError
    );
  }

  /**
   * Reconnect to the SSH server
   */
  async reconnect(): Promise<void> {
    logInfo(this.logger, 'Reconnecting SSH client');
    this.disconnect();
    await this.connect();
  }

  /**
   * Disconnect from the SSH server
   */
  disconnect(): void {
    this.stopKeepalive();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    if (this.client) {
      this.client.removeAllListeners();
      this.client.end();
      this.client = null;
    }

    this.state = ConnectionState.DISCONNECTED;
    logInfo(this.logger, 'SSH client disconnected');
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    if (!this.isConnected()) {
      return false;
    }

    try {
      await this.executeCommand('echo health', 5000);
      return true;
    } catch (error) {
      logDebug(this.logger, 'Health check failed', { error });
      return false;
    }
  }

  /**
   * Get connection statistics
   */
  getStats(): {
    state: ConnectionState;
    connected: boolean;
    lastActivity: number;
    idleTime: number;
    connectionAttempts: number;
  } {
    return {
      state: this.state,
      connected: this.isConnected(),
      lastActivity: this.lastActivity,
      idleTime: Date.now() - this.lastActivity,
      connectionAttempts: this.connectionAttempts,
    };
  }

  /**
   * Utility sleep function
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}