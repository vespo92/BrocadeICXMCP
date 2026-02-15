/**
 * Telnet client for Brocade ICX switches.
 * Uses raw net.Socket with IAC protocol negotiation — no external deps.
 * Drop-in replacement for BrocadeSSHClient via the BrocadeTransport interface.
 */

import net from 'net';
import winston from 'winston';
import { BrocadeConfig } from '../types/index.js';
import { BrocadeTransport } from './transport-interface.js';
import {
  TelnetConnectionError,
  CommandExecutionError,
  TimeoutError,
} from '../core/errors.js';
import { logError, logInfo, logDebug, logWarn } from '../core/logger.js';

// Telnet IAC (Interpret As Command) constants
const IAC = 0xff;
const DONT = 0xfe;
const DO = 0xfd;
const WONT = 0xfc;
const WILL = 0xfb;
const SB = 0xfa;
const SE = 0xf0;

// Common telnet options
const OPT_ECHO = 0x01;
const OPT_SUPPRESS_GO_AHEAD = 0x03;
const OPT_TERMINAL_TYPE = 0x18;
const OPT_NAWS = 0x1f; // Negotiate About Window Size
const OPT_LINEMODE = 0x22;

enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  ERROR = 'error',
}

export class BrocadeTelnetClient implements BrocadeTransport {
  private socket: net.Socket | null = null;
  private config: BrocadeConfig;
  private logger: winston.Logger;
  private state: ConnectionState = ConnectionState.DISCONNECTED;
  private reconnectTimer?: NodeJS.Timeout;
  private keepaliveTimer?: NodeJS.Timeout;
  private lastActivity: number = Date.now();
  private connectionAttempts: number = 0;
  private readonly maxRetries: number;
  private readonly retryDelay: number;

  // Prompt detection
  private promptPattern: RegExp = /.*[>#]\s*$/;
  private learnedPrompt: string = '';
  private inEnableMode: boolean = false;

  // Data accumulation buffer for incoming data between commands
  private dataBuffer: string = '';

  constructor(config: BrocadeConfig, logger: winston.Logger) {
    this.config = config;
    this.logger = logger;
    this.maxRetries = config.maxRetries ?? 3;
    this.retryDelay = config.retryDelay ?? 1000;
  }

  getState(): ConnectionState {
    return this.state;
  }

  isConnected(): boolean {
    return this.state === ConnectionState.CONNECTED && this.socket !== null && !this.socket.destroyed;
  }

  /**
   * Connect to the telnet server with retry logic
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
        logWarn(this.logger, `Telnet connection attempt ${this.connectionAttempts} failed`, {
          maxRetries: this.maxRetries,
          error: error instanceof Error ? error.message : String(error),
        });

        if (this.connectionAttempts >= this.maxRetries) {
          this.state = ConnectionState.ERROR;
          throw new TelnetConnectionError(
            `Failed to connect via telnet after ${this.maxRetries} attempts`,
            { lastError: error }
          );
        }

        const delay = this.retryDelay * Math.pow(2, this.connectionAttempts - 1);
        await this.sleep(delay);
      }
    }
  }

  /**
   * Attempt a single telnet connection
   */
  private async attemptConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket) {
        this.socket.removeAllListeners();
        this.socket.destroy();
      }

      this.socket = new net.Socket();
      this.dataBuffer = '';

      const port = this.config.port;
      const host = this.config.host;
      const connectTimeout = this.config.timeout ?? 30000;

      const connectionTimer = setTimeout(() => {
        if (this.socket) {
          this.socket.destroy();
        }
        reject(new TimeoutError('Telnet connection timeout', connectTimeout));
      }, connectTimeout);

      // Accumulate initial data to detect prompt
      let initialData = Buffer.alloc(0);
      let promptDetected = false;

      const onData = (data: Buffer) => {
        // Process IAC sequences, stripping them from the payload
        const cleaned = this.processIAC(data);
        if (cleaned.length === 0) return;

        initialData = Buffer.concat([initialData, cleaned]);
        const text = initialData.toString('utf-8');

        // Check for login prompt (some switches require it)
        if (!promptDetected && /login[:\s]*$/i.test(text)) {
          logDebug(this.logger, 'Login prompt detected, sending username');
          this.socket?.write(this.config.username + '\r\n');
          initialData = Buffer.alloc(0);
          return;
        }

        // Check for password prompt
        if (!promptDetected && /password[:\s]*$/i.test(text)) {
          logDebug(this.logger, 'Password prompt detected, sending password');
          this.socket?.write(this.config.password + '\r\n');
          initialData = Buffer.alloc(0);
          return;
        }

        // Check for the CLI prompt (e.g., "telnet@SWITCH_2>" or "ICX6610#")
        if (!promptDetected && this.detectPrompt(text)) {
          promptDetected = true;
          clearTimeout(connectionTimer);
          this.socket?.removeListener('data', onData);

          this.state = ConnectionState.CONNECTED;
          this.connectionAttempts = 0;
          this.lastActivity = Date.now();

          logInfo(this.logger, 'Telnet connection established', {
            host,
            port,
            learnedPrompt: this.learnedPrompt,
            enableMode: this.inEnableMode,
          });

          // Try to enter enable mode and set terminal length
          this.postConnectSetup().then(() => resolve()).catch(() => resolve());
        }
      };

      this.socket.on('data', onData);

      this.socket.on('error', (err: Error) => {
        clearTimeout(connectionTimer);
        this.state = ConnectionState.ERROR;
        reject(new TelnetConnectionError(
          `Telnet connection error: ${err.message}`,
          { originalError: err }
        ));
      });

      this.socket.on('close', () => {
        clearTimeout(connectionTimer);
        const wasConnected = this.state === ConnectionState.CONNECTED;
        this.state = ConnectionState.DISCONNECTED;
        logInfo(this.logger, 'Telnet connection closed', { wasConnected });

        if (wasConnected) {
          this.scheduleReconnect();
        }
      });

      this.socket.on('end', () => {
        logDebug(this.logger, 'Telnet connection ended');
      });

      this.socket.connect(port, host);
    });
  }

  /**
   * Detect the CLI prompt from text and learn it for future matching
   */
  private detectPrompt(text: string): boolean {
    const lines = text.split('\n');
    const lastLine = lines[lines.length - 1].trim();

    // Match common Brocade prompts: "name>" (user) or "name#" (enable) or "name(config)#"
    const promptMatch = lastLine.match(/^(\S+(?:\([^)]+\))?)\s*([>#])\s*$/);
    if (promptMatch) {
      this.learnedPrompt = promptMatch[1];
      this.inEnableMode = promptMatch[2] === '#';
      // Build a regex that matches this prompt in any mode
      const escaped = this.learnedPrompt.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // Match the base hostname with optional (config...) suffix
      const base = escaped.split('\\(')[0];
      this.promptPattern = new RegExp(`${base}(?:\\([^)]*\\))?\\s*[>#]\\s*$`);
      logDebug(this.logger, 'Learned prompt pattern', {
        prompt: this.learnedPrompt,
        pattern: this.promptPattern.source,
      });
      return true;
    }

    return false;
  }

  /**
   * Post-connection setup: try enable mode and set terminal length 0
   */
  private async postConnectSetup(): Promise<void> {
    // Try to enter enable mode if not already there
    if (!this.inEnableMode) {
      try {
        // Small delay to let the socket settle after initial connection
        await this.sleep(500);

        const enableResult = await this.rawSendAndWait('enable\r\n', 5000);
        const enableStripped = this.stripAnsi(enableResult).trim();
        logDebug(this.logger, 'Enable command response', {
          raw: enableStripped,
          lastChars: enableStripped.slice(-30),
          matchesPasswordPrompt: /password[:\s]*$/i.test(enableStripped),
        });

        if (/password[:\s]*$/i.test(enableStripped)) {
          // Enable password required
          const pw = this.config.enablePassword || this.config.password;
          logDebug(this.logger, 'Sending enable password', {
            passwordLength: pw.length,
            usingEnablePassword: !!this.config.enablePassword,
          });

          // Small delay before sending password
          await this.sleep(200);
          const result = await this.rawSendAndWait(pw + '\r\n', 5000);
          const resultStripped = this.stripAnsi(result).trim();
          logDebug(this.logger, 'Enable password response', {
            raw: resultStripped,
            lastLine: resultStripped.split('\n').pop(),
            endsWithHash: this.isPromptLine(resultStripped, '#'),
            endsWithAngle: this.isPromptLine(resultStripped, '>'),
          });

          if (this.isPromptLine(resultStripped, '#')) {
            this.inEnableMode = true;
            // Re-learn the prompt now that we're in enable mode
            this.detectPrompt(resultStripped);
            logInfo(this.logger, 'Entered enable mode via password');
          } else {
            logWarn(this.logger, 'Enable password rejected, staying in user mode', {
              response: resultStripped.slice(-80),
            });
          }
        } else if (this.isPromptLine(enableStripped, '#')) {
          this.inEnableMode = true;
          this.detectPrompt(enableStripped);
          logInfo(this.logger, 'Entered enable mode (no password required)');
        } else {
          logWarn(this.logger, 'Unexpected enable response', { response: enableStripped });
        }
      } catch (err) {
        logWarn(this.logger, 'Failed to enter enable mode, continuing in user mode', {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // Set terminal length 0 to disable pagination (requires enable mode)
    if (this.inEnableMode) {
      try {
        await this.rawSendAndWait('terminal length 0\r\n', 3000);
        logDebug(this.logger, 'Set terminal length 0');
      } catch {
        logDebug(this.logger, 'Could not set terminal length 0');
      }
    }
  }

  /**
   * Check if the last line of text is a prompt with the given suffix
   */
  private isPromptLine(text: string, suffix: string): boolean {
    const lines = text.split('\n');
    const lastLine = lines[lines.length - 1].trim();
    return lastLine.endsWith(suffix);
  }

  /**
   * Process IAC (Interpret As Command) sequences from raw telnet data.
   * Responds to DO/WILL negotiations and strips IAC bytes from the payload.
   */
  private processIAC(data: Buffer): Buffer {
    const cleaned: number[] = [];
    let i = 0;

    while (i < data.length) {
      if (data[i] === IAC) {
        if (i + 1 >= data.length) break;

        const cmd = data[i + 1];

        if (cmd === IAC) {
          // Escaped 0xFF
          cleaned.push(IAC);
          i += 2;
          continue;
        }

        if (cmd === DO || cmd === DONT || cmd === WILL || cmd === WONT) {
          if (i + 2 >= data.length) break;
          const opt = data[i + 2];
          this.handleIACNegotiation(cmd, opt);
          i += 3;
          continue;
        }

        if (cmd === SB) {
          // Skip subnegotiation until IAC SE
          let j = i + 2;
          while (j < data.length - 1) {
            if (data[j] === IAC && data[j + 1] === SE) {
              j += 2;
              break;
            }
            j++;
          }
          i = j;
          continue;
        }

        // Skip other 2-byte IAC commands
        i += 2;
        continue;
      }

      cleaned.push(data[i]);
      i++;
    }

    return Buffer.from(cleaned);
  }

  /**
   * Respond to telnet option negotiations
   */
  private handleIACNegotiation(cmd: number, opt: number): void {
    if (!this.socket || this.socket.destroyed) return;

    if (cmd === DO) {
      // We WILL suppress go-ahead, but WONT everything else
      if (opt === OPT_SUPPRESS_GO_AHEAD) {
        this.socket.write(Buffer.from([IAC, WILL, opt]));
      } else if (opt === OPT_NAWS) {
        // Respond with WILL NAWS, then send window size
        this.socket.write(Buffer.from([IAC, WILL, opt]));
        // Send window size: 200 cols x 50 rows
        this.socket.write(Buffer.from([IAC, SB, OPT_NAWS, 0, 200, 0, 50, IAC, SE]));
      } else if (opt === OPT_TERMINAL_TYPE) {
        this.socket.write(Buffer.from([IAC, WILL, opt]));
      } else {
        this.socket.write(Buffer.from([IAC, WONT, opt]));
      }
    } else if (cmd === WILL) {
      // Accept echo and suppress-go-ahead from server, refuse rest
      if (opt === OPT_ECHO || opt === OPT_SUPPRESS_GO_AHEAD) {
        this.socket.write(Buffer.from([IAC, DO, opt]));
      } else {
        this.socket.write(Buffer.from([IAC, DONT, opt]));
      }
    } else if (cmd === DONT) {
      this.socket.write(Buffer.from([IAC, WONT, opt]));
    } else if (cmd === WONT) {
      this.socket.write(Buffer.from([IAC, DONT, opt]));
    }
  }

  /**
   * Low-level send data and wait for prompt. Used during connection setup.
   */
  private rawSendAndWait(data: string, timeout: number): Promise<string> {
    return new Promise((resolve, reject) => {
      if (!this.socket || this.socket.destroyed) {
        reject(new TelnetConnectionError('Socket not connected'));
        return;
      }

      let output = '';
      const timer = setTimeout(() => {
        this.socket?.removeListener('data', onData);
        // Resolve with what we have even on timeout (for prompt detection)
        resolve(output);
      }, timeout);

      const onData = (raw: Buffer) => {
        const cleaned = this.processIAC(raw);
        output += cleaned.toString('utf-8');

        // Check for prompt
        if (this.promptPattern.test(this.stripAnsi(output))) {
          clearTimeout(timer);
          this.socket?.removeListener('data', onData);
          resolve(output);
        }

        // Check for password prompt
        if (/password[:\s]*$/i.test(output.trim())) {
          clearTimeout(timer);
          this.socket?.removeListener('data', onData);
          resolve(output);
        }
      };

      this.socket.on('data', onData);
      this.socket.write(data);
    });
  }

  /**
   * Execute a single command and return its output
   */
  async executeCommand(command: string, timeout?: number): Promise<string> {
    if (!this.isConnected()) {
      await this.connect();
    }

    if (!this.socket || this.socket.destroyed) {
      throw new TelnetConnectionError('Socket is null after connection');
    }

    const effectiveTimeout = timeout ?? this.config.timeout ?? 30000;

    return new Promise((resolve, reject) => {
      let output = '';
      let commandSent = false;

      const timer = setTimeout(() => {
        this.socket?.removeListener('data', onData);
        // If we got some output, return it rather than failing
        if (output.length > 0) {
          resolve(this.cleanOutput(output, command));
        } else {
          reject(new TimeoutError(`Command timeout: ${command}`, effectiveTimeout));
        }
      }, effectiveTimeout);

      const onData = (raw: Buffer) => {
        const cleaned = this.processIAC(raw);
        if (cleaned.length === 0) return;

        const text = cleaned.toString('utf-8');
        output += text;

        // Handle --More-- pagination
        if (/--More--/i.test(text) || /--more--/.test(text)) {
          // Send space to get next page
          this.socket?.write(' ');
          return;
        }

        // Check for prompt indicating command completion
        const stripped = this.stripAnsi(output);
        const lines = stripped.split('\n');
        const lastLine = lines[lines.length - 1].trim();

        if (commandSent && this.promptPattern.test(lastLine)) {
          clearTimeout(timer);
          this.socket?.removeListener('data', onData);
          this.lastActivity = Date.now();

          logDebug(this.logger, 'Command executed successfully', {
            command,
            outputLength: output.length,
          });

          resolve(this.cleanOutput(output, command));
        }
      };

      this.socket!.on('data', onData);

      // Send the command
      this.socket!.write(command + '\r\n');
      commandSent = true;
    });
  }

  /**
   * Execute multiple commands sequentially with optimized timeouts for config commands.
   * Config-mode commands (those that don't start with "show") use a shorter timeout
   * since they complete quickly. Inline errors are detected and logged.
   */
  async executeMultipleCommands(commands: string[], timeout?: number): Promise<string[]> {
    const results: string[] = [];
    const defaultTimeout = timeout ?? this.config.timeout ?? 30000;

    for (const command of commands) {
      try {
        // Use a shorter timeout for config-mode commands that complete quickly
        const isShowCommand = command.trim().toLowerCase().startsWith('show');
        const effectiveTimeout = isShowCommand ? defaultTimeout : Math.min(defaultTimeout, 10000);

        const result = await this.executeCommand(command, effectiveTimeout);

        // Detect inline errors in output
        if (this.hasInlineError(result)) {
          logWarn(this.logger, 'Command returned inline error', {
            command,
            output: result.slice(0, 200),
          });
        }

        results.push(result);
      } catch (error) {
        logError(this.logger, error, { command, index: results.length });
        results.push('');
      }
    }

    return results;
  }

  /**
   * Check if command output contains an inline error from the switch
   */
  private hasInlineError(output: string): boolean {
    const errorPatterns = [
      /Invalid input ->/i,
      /Error:/i,
      /not found/i,
      /VLAN.*does not exist/i,
      /Incomplete command/i,
      /Ambiguous input/i,
    ];
    return errorPatterns.some(pattern => pattern.test(output));
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
          await this.sleep(this.retryDelay * attempt);

          if (error instanceof TelnetConnectionError || error instanceof TimeoutError) {
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
   * Clean command output: strip ANSI codes, command echo, prompt, and --More-- artifacts
   */
  private cleanOutput(raw: string, command: string): string {
    let text = this.stripAnsi(raw);

    // Remove --More-- artifacts and the backspaces that clear them
    text = text.replace(/--More--\s*/gi, '');
    // Remove backspace sequences used to overwrite --More--
    text = text.replace(/[\b]+\s*[\b]*/g, '');
    // Remove control characters except newline/tab
    text = text.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '');

    const lines = text.split('\n');
    const cleaned: string[] = [];
    let foundCommand = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip the echoed command
      if (!foundCommand && trimmed === command.trim()) {
        foundCommand = true;
        continue;
      }

      // Skip the trailing prompt
      if (foundCommand && this.promptPattern.test(trimmed) && line === lines[lines.length - 1]) {
        continue;
      }

      if (foundCommand) {
        cleaned.push(line);
      }
    }

    // If we never found the command echo, return everything minus the last prompt line
    if (!foundCommand) {
      const allLines = lines.filter(l => !this.promptPattern.test(l.trim()));
      return allLines.join('\n').trim();
    }

    return cleaned.join('\n').trim();
  }

  /**
   * Strip ANSI escape sequences
   */
  private stripAnsi(text: string): string {
    // eslint-disable-next-line no-control-regex
    return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
               .replace(/\x1b\][^\x07]*\x07/g, '')
               .replace(/\x1b[()][0-9A-B]/g, '');
  }

  /**
   * Wait for an ongoing connection attempt
   */
  private async waitForConnection(): Promise<void> {
    const maxWait = 30000;
    const checkInterval = 100;
    let waited = 0;

    while (waited < maxWait) {
      if (this.state === ConnectionState.CONNECTED) return;
      if (this.state === ConnectionState.ERROR || this.state === ConnectionState.DISCONNECTED) {
        throw new TelnetConnectionError('Connection failed while waiting');
      }
      await this.sleep(checkInterval);
      waited += checkInterval;
    }

    throw new TimeoutError('Timeout waiting for telnet connection', maxWait);
  }

  /**
   * Schedule automatic reconnection
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.state === ConnectionState.RECONNECTING) return;

    this.state = ConnectionState.RECONNECTING;
    logInfo(this.logger, 'Scheduling telnet reconnection', { delay: this.retryDelay });

    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        logError(this.logger, error, { context: 'auto-reconnect' });
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

      if (idleTime > interval && this.isConnected()) {
        this.sendKeepalive();
      }

      if (idleTime > interval * 3 && this.isConnected()) {
        logWarn(this.logger, 'Telnet connection appears stale, reconnecting', { idleTime });
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

  /**
   * Send a keepalive by running a simple command
   */
  private async sendKeepalive(): Promise<void> {
    try {
      // Send empty line — Brocade just re-displays the prompt
      await this.executeCommand('', 3000);
      this.lastActivity = Date.now();
    } catch (error) {
      logDebug(this.logger, 'Telnet keepalive failed', { error });
    }
  }

  /**
   * Reconnect
   */
  async reconnect(): Promise<void> {
    logInfo(this.logger, 'Reconnecting telnet client');
    this.disconnect();
    await this.connect();
  }

  /**
   * Disconnect
   */
  disconnect(): void {
    this.stopKeepalive();

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }

    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.destroy();
      this.socket = null;
    }

    this.state = ConnectionState.DISCONNECTED;
    this.inEnableMode = false;
    this.learnedPrompt = '';
    logInfo(this.logger, 'Telnet client disconnected');
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    if (!this.isConnected()) return false;

    try {
      await this.executeCommand('', 5000);
      return true;
    } catch {
      logDebug(this.logger, 'Telnet health check failed');
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
    enableMode: boolean;
    learnedPrompt: string;
  } {
    return {
      state: this.state,
      connected: this.isConnected(),
      lastActivity: this.lastActivity,
      idleTime: Date.now() - this.lastActivity,
      connectionAttempts: this.connectionAttempts,
      enableMode: this.inEnableMode,
      learnedPrompt: this.learnedPrompt,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
