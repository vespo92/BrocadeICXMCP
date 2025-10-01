/**
 * Custom error classes for Brocade MCP Server
 */

export class BrocadeError extends Error {
  public readonly code: string;
  public readonly details?: unknown;

  constructor(message: string, code: string, details?: unknown) {
    super(message);
    this.name = 'BrocadeError';
    this.code = code;
    this.details = details;

    // Maintains proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export class SSHConnectionError extends BrocadeError {
  constructor(message: string, details?: unknown) {
    super(message, 'SSH_CONNECTION_ERROR', details);
    this.name = 'SSHConnectionError';
  }
}

export class CommandExecutionError extends BrocadeError {
  public readonly command?: string;
  public readonly exitCode?: number;

  constructor(
    message: string,
    command?: string,
    exitCode?: number,
    details?: unknown
  ) {
    super(message, 'COMMAND_EXECUTION_ERROR', details);
    this.name = 'CommandExecutionError';
    this.command = command;
    this.exitCode = exitCode;
  }
}

export class ConfigurationError extends BrocadeError {
  constructor(message: string, details?: unknown) {
    super(message, 'CONFIGURATION_ERROR', details);
    this.name = 'ConfigurationError';
  }
}

export class AuthenticationError extends BrocadeError {
  constructor(message: string, details?: unknown) {
    super(message, 'AUTHENTICATION_ERROR', details);
    this.name = 'AuthenticationError';
  }
}

export class TimeoutError extends BrocadeError {
  public readonly timeout: number;

  constructor(message: string, timeout: number, details?: unknown) {
    super(message, 'TIMEOUT_ERROR', details);
    this.name = 'TimeoutError';
    this.timeout = timeout;
  }
}

export class ValidationError extends BrocadeError {
  public readonly field?: string;

  constructor(message: string, field?: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
    this.field = field;
  }
}

/**
 * Type guard to check if an error is a BrocadeError
 */
export function isBrocadeError(error: unknown): error is BrocadeError {
  return error instanceof BrocadeError;
}

/**
 * Type guard to check if an error is a SSHConnectionError
 */
export function isSSHConnectionError(error: unknown): error is SSHConnectionError {
  return error instanceof SSHConnectionError;
}

/**
 * Type guard to check if an error is a CommandExecutionError
 */
export function isCommandExecutionError(error: unknown): error is CommandExecutionError {
  return error instanceof CommandExecutionError;
}

/**
 * Format error for logging
 */
export function formatError(error: unknown): string {
  if (isBrocadeError(error)) {
    return `[${error.code}] ${error.message}${error.details ? ` - Details: ${JSON.stringify(error.details)}` : ''}`;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}