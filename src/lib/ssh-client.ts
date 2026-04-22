/**
 * Interactive shell-based SSH client for Brocade ICX switches.
 *
 * Brocade switches do not support SSH exec channels reliably -- they either
 * return empty output or hang.  This implementation opens ONE persistent
 * interactive shell via client.shell() and multiplexes all commands through
 * it, detecting prompts to know when a command has finished.
 */

import { Client, type ClientChannel } from 'ssh2';
import type winston from 'winston';
import { AuthenticationError, CommandExecutionError, SSHConnectionError, TimeoutError } from '../core/errors.js';
import { logDebug, logError, logInfo, logWarn } from '../core/logger.js';
import type { BrocadeConfig } from '../types/index.js';
import type { BrocadeTransport } from './transport-interface.js';

// ---------------------------------------------------------------------------
// Prompt detection
// ---------------------------------------------------------------------------

/**
 * Matches Brocade CLI prompts:
 *   SSH@hostname>                    (user mode)
 *   SSH@hostname#                    (enable mode)
 *   SSH@hostname(config)#            (global config)
 *   SSH@hostname(config-vlan-100)#   (vlan config)
 *   SSH@hostname(config-if-e1000-1/1/1)# (interface config)
 *   hostname>  /  hostname#          (non-SSH prefix variants)
 *
 * The regex captures everything up to and including the final > or #
 * at the end of the trimmed buffer.
 */
const PROMPT_RE = /[\r\n]?[\w@\-./]+(?:\([^)]*\))?[>#]\s*$/;

/** Brocade pagination marker */
const MORE_RE = /--More--/;

/** ANSI escape codes (colors, cursor movement, etc.) */
// eslint-disable-next-line no-control-regex
const ANSI_RE = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

// ---------------------------------------------------------------------------
// Connection state
// ---------------------------------------------------------------------------

enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error',
}

// ---------------------------------------------------------------------------
// Main class
// ---------------------------------------------------------------------------

export class BrocadeSSHClient implements BrocadeTransport {
  private client: Client | null = null;
  private shell: ClientChannel | null = null;
  private config: BrocadeConfig;
  private logger: winston.Logger;
  private state: ConnectionState = ConnectionState.DISCONNECTED;
  private reconnectTimer?: NodeJS.Timeout;
  private keepaliveTimer?: NodeJS.Timeout;
  private lastActivity: number = Date.now();
  private connectionAttempts: number = 0;
  private readonly maxRetries: number;
  private readonly retryDelay: number;

  /** Buffer that accumulates all data arriving on the shell channel */
  private shellBuffer: string = '';

  /** Whether we are currently inside enable mode (or higher) */
  private inEnableMode: boolean = false;

  /**
   * Mutex-style queue so only one command runs at a time on the shell.
   * Each entry is a resolve function that gets called when the previous
   * command finishes, allowing the next caller to proceed.
   */
  private commandQueue: Array<() => void> = [];
  private commandRunning: boolean = false;

  constructor(config: BrocadeConfig, logger: winston.Logger) {
    this.config = config;
    this.logger = logger;
    this.maxRetries = config.maxRetries ?? 3;
    this.retryDelay = config.retryDelay ?? 1000;
  }

  // -----------------------------------------------------------------------
  // Public state helpers
  // -----------------------------------------------------------------------

  getState(): ConnectionState {
    return this.state;
  }

  isConnected(): boolean {
    return this.state === ConnectionState.CONNECTED && this.client !== null && this.shell !== null;
  }

  // -----------------------------------------------------------------------
  // Connect / disconnect
  // -----------------------------------------------------------------------

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
          throw new SSHConnectionError(`Failed to connect after ${this.maxRetries} attempts`, { lastError: error });
        }

        const delay = this.retryDelay * 2 ** (this.connectionAttempts - 1);
        await this.sleep(delay);
      }
    }
  }

  disconnect(): void {
    this.stopKeepalive();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    if (this.shell) {
      try {
        this.shell.removeAllListeners();
        this.shell.end();
      } catch {
        /* ignore */
      }
      this.shell = null;
    }

    if (this.client) {
      this.client.removeAllListeners();
      this.client.end();
      this.client = null;
    }

    this.shellBuffer = '';
    this.inEnableMode = false;
    this.commandRunning = false;
    this.commandQueue = [];
    this.state = ConnectionState.DISCONNECTED;
    logInfo(this.logger, 'SSH client disconnected');
  }

  async reconnect(): Promise<void> {
    logInfo(this.logger, 'Reconnecting SSH client');
    this.disconnect();
    await this.connect();
  }

  // -----------------------------------------------------------------------
  // Interactive shell bootstrap
  // -----------------------------------------------------------------------

  /**
   * Establish the SSH connection and open a persistent interactive shell.
   */
  private async attemptConnection(): Promise<void> {
    // Phase 1 -- TCP + SSH handshake via client.connect()
    await this.sshHandshake();

    // Phase 2 -- open interactive shell channel
    await this.openShell();

    // Phase 3 -- wait for the initial prompt
    await this.waitForPrompt(this.config.timeout ?? 30000);

    // Phase 4 -- try to disable pagination (best-effort)
    try {
      await this.shellWrite('skip-page-display\r', 5000);
      logDebug(this.logger, 'Sent skip-page-display');
    } catch {
      logDebug(this.logger, 'skip-page-display not supported or timed out -- will handle --More-- inline');
    }

    // Phase 5 -- enter enable mode (required for config commands)
    // Always attempt if enablePassword is set; the switch needs # prompt for writes
    if (this.config.enablePassword) {
      await this.enterEnableMode();
    } else {
      logWarn(this.logger, 'No enablePassword configured — staying in user mode (read-only)');
    }

    this.state = ConnectionState.CONNECTED;
    this.connectionAttempts = 0;
    this.lastActivity = Date.now();
    logInfo(this.logger, 'SSH interactive shell established', {
      host: this.config.host,
      port: this.config.port,
      enableMode: this.inEnableMode,
    });
  }

  /**
   * Phase 1 -- SSH handshake returning a ready Client.
   */
  private sshHandshake(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.client) {
        this.client.removeAllListeners();
        this.client.end();
      }

      this.client = new Client();

      // Brocade keyboard-interactive auth handler
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.client as any).on(
        'keyboard-interactive',
        (
          _name: string,
          _instructions: string,
          _instructionsLang: string,
          prompts: Array<{ prompt: string; echo: boolean }>,
          finish: (responses: string[]) => void,
        ) => {
          finish(prompts.map(() => this.config.password));
        },
      );

      const connectionTimeout = setTimeout(() => {
        if (this.client) this.client.end();
        reject(new TimeoutError('SSH connection timeout', this.config.timeout ?? 30000));
      }, this.config.timeout ?? 30000);

      this.client
        .on('ready', () => {
          clearTimeout(connectionTimeout);
          resolve();
        })
        .on('error', (err: Error) => {
          clearTimeout(connectionTimeout);
          this.state = ConnectionState.ERROR;
          if (err.message.includes('authentication') || err.message.includes('password')) {
            reject(new AuthenticationError('SSH authentication failed', { originalError: err.message }));
          } else {
            reject(new SSHConnectionError(`SSH connection error: ${err.message}`, { originalError: err }));
          }
        })
        .on('close', () => {
          clearTimeout(connectionTimeout);
          const wasConnected = this.state === ConnectionState.CONNECTED;
          this.state = ConnectionState.DISCONNECTED;
          this.shell = null;
          logInfo(this.logger, 'SSH connection closed', { wasConnected });
          if (wasConnected) {
            this.scheduleReconnect();
          }
        })
        .on('end', () => {
          clearTimeout(connectionTimeout);
          logDebug(this.logger, 'SSH connection ended');
        });

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
            serverHostKey: ['ssh-rsa', 'ssh-dss', 'ecdsa-sha2-nistp256', 'ecdsa-sha2-nistp384', 'ecdsa-sha2-nistp521'],
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
   * Phase 2 -- request an interactive shell channel on the SSH connection.
   */
  private openShell(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.client) {
        return reject(new SSHConnectionError('Client is null when opening shell'));
      }

      const shellTimeout = setTimeout(() => {
        reject(new TimeoutError('Shell open timeout', 15000));
      }, 15000);

      this.client.shell({ term: 'vt100', rows: 24, cols: 200 }, (err: Error | undefined, stream: ClientChannel) => {
        clearTimeout(shellTimeout);
        if (err) {
          return reject(new SSHConnectionError(`Failed to open shell: ${err.message}`, { originalError: err }));
        }

        this.shell = stream;
        this.shellBuffer = '';

        stream.on('data', (data: Buffer) => {
          const chunk = data.toString('utf-8');
          this.shellBuffer += chunk;
          this.lastActivity = Date.now();

          // Auto-handle --More-- pagination whenever it appears
          if (MORE_RE.test(this.shellBuffer)) {
            logDebug(this.logger, 'Detected --More-- prompt, sending space');
            stream.write(' ');
          }
        });

        stream.on('close', () => {
          logDebug(this.logger, 'Shell channel closed');
          this.shell = null;
        });

        stream.stderr.on('data', (data: Buffer) => {
          logDebug(this.logger, 'Shell stderr', { data: data.toString('utf-8') });
        });

        resolve();
      });
    });
  }

  // -----------------------------------------------------------------------
  // Prompt / data helpers
  // -----------------------------------------------------------------------

  /**
   * Wait until the shell buffer ends with a recognised prompt.
   * Returns the full buffer content accumulated since the last drain.
   */
  private waitForPrompt(timeout: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const deadline = setTimeout(() => {
        const buf = this.shellBuffer;
        this.shellBuffer = '';
        logDebug(this.logger, 'Prompt wait timed out', {
          timeout,
          bufferTail: buf.slice(-200),
        });
        // Resolve with what we have rather than hard-failing -- the caller
        // can inspect the output for partial results.
        reject(
          new TimeoutError(`Timed out waiting for prompt (${timeout}ms)`, timeout, {
            partialOutput: buf,
          }),
        );
      }, timeout);

      const check = setInterval(() => {
        // Strip ANSI and --More-- artifacts before checking for prompt
        const cleaned = this.stripAnsi(this.shellBuffer);
        if (PROMPT_RE.test(cleaned)) {
          clearInterval(check);
          clearTimeout(deadline);
          const buf = this.shellBuffer;
          this.shellBuffer = '';
          resolve(buf);
        }
      }, 50);
    });
  }

  /**
   * Write data to the shell and wait for the next prompt.
   * Returns the raw output between write and prompt.
   */
  private async shellWrite(data: string, timeout?: number): Promise<string> {
    if (!this.shell) {
      throw new SSHConnectionError('Shell channel is not open');
    }

    // Drain the buffer so we only capture output from this command
    this.shellBuffer = '';

    this.shell.write(data);

    return this.waitForPrompt(timeout ?? this.config.timeout ?? 30000);
  }

  // -----------------------------------------------------------------------
  // Enable mode
  // -----------------------------------------------------------------------

  /**
   * Enter Brocade enable mode.
   *
   * Brocade prompts vary:
   *   - Some ask for "Password:" directly
   *   - Some ask "User Name:" first then "Password:"
   *   - Already in enable mode if prompt ends with #
   */
  async enterEnableMode(): Promise<void> {
    if (this.inEnableMode) return;

    if (!this.shell) {
      throw new SSHConnectionError('Shell not open -- cannot enter enable mode');
    }

    logDebug(this.logger, 'Entering enable mode');

    // Drain any stale buffer content
    this.shellBuffer = '';

    // Send the enable command
    this.shell.write('enable\r');

    // Now we need to watch for prompts: Password:, User Name:, or a # prompt
    const enableTimeout = 15000;
    const result = await this.waitForEnableSequence(enableTimeout);

    // Verify we got a # prompt
    const cleaned = this.stripAnsi(result);
    if (cleaned.trimEnd().endsWith('#')) {
      this.inEnableMode = true;
      logInfo(this.logger, 'Enable mode entered successfully');
    } else {
      logWarn(this.logger, 'Enable mode entry may have failed', {
        outputTail: cleaned.slice(-100),
      });
    }
  }

  /**
   * Handle the interactive enable sequence which may involve
   * "User Name:" and "Password:" prompts before we get a # prompt.
   */
  private waitForEnableSequence(timeout: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const deadline = setTimeout(() => {
        const buf = this.shellBuffer;
        this.shellBuffer = '';
        reject(new TimeoutError('Enable mode timeout', timeout, { partialOutput: buf }));
      }, timeout);

      let sentUsername = false;
      let sentPassword = false;

      const check = setInterval(() => {
        const raw = this.shellBuffer;
        const cleaned = this.stripAnsi(raw).toLowerCase();

        // Check if we are being asked for a username
        if (!sentUsername && /user\s*name\s*:/i.test(cleaned)) {
          const enableUser = this.config.enableUsername || this.config.username;
          logDebug(this.logger, 'Enable: sending username', { enableUser });
          this.shell?.write(`${enableUser}\r`);
          sentUsername = true;
          return;
        }

        // Check if we are being asked for a password
        if (!sentPassword && /password\s*:/i.test(cleaned)) {
          const enablePw = this.config.enablePassword || this.config.password;
          logDebug(this.logger, 'Enable: sending password');
          this.shell?.write(`${enablePw}\r`);
          sentPassword = true;
          return;
        }

        // Check for final prompt (enable mode = #)
        if (PROMPT_RE.test(this.stripAnsi(raw))) {
          const trimmed = this.stripAnsi(raw).trimEnd();
          if (trimmed.endsWith('#')) {
            clearInterval(check);
            clearTimeout(deadline);
            const buf = this.shellBuffer;
            this.shellBuffer = '';
            resolve(buf);
          } else if (trimmed.endsWith('>')) {
            // Still in user mode -- enable might have been rejected
            clearInterval(check);
            clearTimeout(deadline);
            const buf = this.shellBuffer;
            this.shellBuffer = '';
            resolve(buf);
          }
        }
      }, 50);
    });
  }

  // -----------------------------------------------------------------------
  // Command execution (public interface)
  // -----------------------------------------------------------------------

  /**
   * Execute a single command on the Brocade switch via the interactive shell.
   *
   * Commands are serialised -- only one runs at a time.  Callers that
   * overlap will queue and execute in order.
   */
  async executeCommand(command: string, timeout?: number): Promise<string> {
    // Ensure connected
    if (!this.isConnected()) {
      await this.connect();
    }

    // Acquire the command lock
    await this.acquireCommandLock();

    try {
      return await this.runCommand(command, timeout);
    } finally {
      this.releaseCommandLock();
    }
  }

  /**
   * Execute multiple commands in sequence, returning results for each.
   */
  async executeMultipleCommands(commands: string[], timeout?: number): Promise<string[]> {
    const results: string[] = [];

    for (const command of commands) {
      try {
        const result = await this.executeCommand(command, timeout);
        results.push(result);
      } catch (error) {
        logError(this.logger, error, { command, index: results.length });
        results.push('');
      }
    }

    return results;
  }

  /**
   * Execute a command with automatic retries.
   */
  async executeCommandWithRetry(command: string, maxAttempts: number = 3, timeout?: number): Promise<string> {
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
          await this.sleep(this.retryDelay * attempt);
          if (error instanceof SSHConnectionError || error instanceof TimeoutError) {
            await this.reconnect();
          }
        }
      }
    }

    throw new CommandExecutionError(`Command failed after ${maxAttempts} attempts`, command, undefined, lastError);
  }

  // -----------------------------------------------------------------------
  // Internal command runner
  // -----------------------------------------------------------------------

  /**
   * Actually send a command to the shell, collect output, clean it, return.
   */
  private async runCommand(command: string, timeout?: number): Promise<string> {
    if (!this.shell) {
      throw new SSHConnectionError('Shell channel is not open');
    }

    const effectiveTimeout = timeout ?? this.config.timeout ?? 30000;

    logDebug(this.logger, 'Executing command', { command, timeout: effectiveTimeout });

    // Drain any residual buffer
    this.shellBuffer = '';

    // Send the command
    this.shell.write(command + '\r');

    // Wait for the prompt that signals completion
    let raw: string;
    try {
      raw = await this.waitForPrompt(effectiveTimeout);
    } catch (error) {
      if (error instanceof TimeoutError) {
        // Return whatever partial output we captured
        const partial = this.shellBuffer;
        this.shellBuffer = '';
        throw new CommandExecutionError(`Command timed out after ${effectiveTimeout}ms`, command, undefined, {
          partialOutput: this.cleanOutput(partial, command),
        });
      }
      throw error;
    }

    const cleaned = this.cleanOutput(raw, command);
    this.lastActivity = Date.now();

    logDebug(this.logger, 'Command executed successfully', {
      command,
      outputLength: cleaned.length,
    });

    return cleaned;
  }

  // -----------------------------------------------------------------------
  // Output cleaning
  // -----------------------------------------------------------------------

  /**
   * Clean raw shell output:
   *  1. Strip ANSI escape codes
   *  2. Remove the echoed command (first line)
   *  3. Remove --More-- artifacts and trailing whitespace around them
   *  4. Remove the trailing prompt line
   *  5. Trim leading/trailing blank lines
   */
  private cleanOutput(raw: string, command: string): string {
    let output = this.stripAnsi(raw);

    // Split into lines
    let lines = output.split(/\r?\n/);

    // Remove the first line if it is the echoed command
    if (lines.length > 0) {
      const firstLine = lines[0].trim();
      // The echo may contain just the command, or the command with prompt prefix
      if (firstLine === command.trim() || firstLine.endsWith(command.trim())) {
        lines = lines.slice(1);
      }
    }

    // Remove the last line if it looks like a prompt
    if (lines.length > 0) {
      const lastLine = lines[lines.length - 1].trim();
      if (PROMPT_RE.test(lastLine)) {
        lines = lines.slice(0, -1);
      }
    }

    // Remove --More-- artifacts and the backspace sequences that follow them
    output = lines.join('\n');
    // --More-- is typically followed by backspaces that erase it
    // eslint-disable-next-line no-control-regex
    output = output.replace(/--More--\s*(\x08+\s*)?/g, '');

    // Collapse sequences of blank lines into a single blank line
    output = output.replace(/\n{3,}/g, '\n\n');

    return output.trim();
  }

  /**
   * Strip ANSI escape sequences from a string.
   */
  private stripAnsi(str: string): string {
    return str.replace(ANSI_RE, '');
  }

  // -----------------------------------------------------------------------
  // Command serialisation (mutex)
  // -----------------------------------------------------------------------

  private acquireCommandLock(): Promise<void> {
    if (!this.commandRunning) {
      this.commandRunning = true;
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      this.commandQueue.push(resolve);
    });
  }

  private releaseCommandLock(): void {
    if (this.commandQueue.length > 0) {
      const next = this.commandQueue.shift()!;
      next();
    } else {
      this.commandRunning = false;
    }
  }

  // -----------------------------------------------------------------------
  // Health / stats / keepalive
  // -----------------------------------------------------------------------

  async healthCheck(): Promise<boolean> {
    if (!this.isConnected()) {
      return false;
    }

    try {
      // Send a harmless command -- on Brocade, an empty line just returns a prompt
      await this.executeCommand('show version brief', 10000);
      return true;
    } catch (error) {
      logDebug(this.logger, 'Health check failed', { error });
      return false;
    }
  }

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

  // -----------------------------------------------------------------------
  // Keepalive
  // -----------------------------------------------------------------------

  private startKeepalive(): void {
    this.stopKeepalive();

    const interval = this.config.keepaliveInterval ?? 10000;
    this.keepaliveTimer = setInterval(() => {
      const idleTime = Date.now() - this.lastActivity;

      if (idleTime > interval && this.isConnected()) {
        this.sendKeepalive();
      }

      // If we've been idle for 3x the interval, something is wrong
      if (idleTime > interval * 3 && this.isConnected()) {
        logWarn(this.logger, 'Connection appears stale, reconnecting', { idleTime });
        this.reconnect();
      }
    }, interval);
  }

  private stopKeepalive(): void {
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = undefined;
    }
  }

  private async sendKeepalive(): Promise<void> {
    try {
      // Send an empty line -- Brocade will just echo a new prompt
      if (this.shell && !this.commandRunning) {
        this.shellBuffer = '';
        this.shell.write('\r');
        await this.waitForPrompt(5000);
        this.lastActivity = Date.now();
      }
    } catch (error) {
      logDebug(this.logger, 'Keepalive failed', { error });
    }
  }

  // -----------------------------------------------------------------------
  // Reconnect scheduling
  // -----------------------------------------------------------------------

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    if (this.state === ConnectionState.RECONNECTING) {
      return;
    }

    this.state = ConnectionState.RECONNECTING;
    logInfo(this.logger, 'Scheduling reconnection', { delay: this.retryDelay });

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        logError(this.logger, error, { context: 'auto-reconnect' });
        this.scheduleReconnect();
      }
    }, this.retryDelay);
  }

  // -----------------------------------------------------------------------
  // Utilities
  // -----------------------------------------------------------------------

  private waitForConnection(): Promise<void> {
    const maxWait = 30000;
    const checkInterval = 100;

    return new Promise((resolve, reject) => {
      let waited = 0;
      const iv = setInterval(() => {
        waited += checkInterval;
        if (this.state === ConnectionState.CONNECTED) {
          clearInterval(iv);
          resolve();
        } else if (this.state === ConnectionState.ERROR || this.state === ConnectionState.DISCONNECTED) {
          clearInterval(iv);
          reject(new SSHConnectionError('Connection failed while waiting'));
        } else if (waited >= maxWait) {
          clearInterval(iv);
          reject(new TimeoutError('Timeout waiting for connection', maxWait));
        }
      }, checkInterval);
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
