/**
 * Enhanced logger utilities for Brocade MCP Server
 */

import winston from 'winston';
import { formatError } from './errors.js';

/**
 * Create a child logger with additional context
 */
export function createChildLogger(
  parentLogger: winston.Logger,
  context: Record<string, unknown>
): winston.Logger {
  return parentLogger.child(context);
}

/**
 * Log an error with proper formatting
 */
export function logError(
  logger: winston.Logger,
  error: unknown,
  context?: Record<string, unknown>
): void {
  const errorMessage = formatError(error);
  const errorData: Record<string, unknown> = {
    message: errorMessage,
    ...context,
  };

  if (error instanceof Error) {
    errorData.stack = error.stack;
    errorData.name = error.name;
  }

  logger.error(errorData);
}

/**
 * Log a debug message with data
 */
export function logDebug(
  logger: winston.Logger,
  message: string,
  data?: Record<string, unknown>
): void {
  logger.debug({
    message,
    ...data,
  });
}

/**
 * Log an info message with data
 */
export function logInfo(
  logger: winston.Logger,
  message: string,
  data?: Record<string, unknown>
): void {
  logger.info({
    message,
    ...data,
  });
}

/**
 * Log a warning message with data
 */
export function logWarn(
  logger: winston.Logger,
  message: string,
  data?: Record<string, unknown>
): void {
  logger.warn({
    message,
    ...data,
  });
}

/**
 * Create a timer for performance logging
 */
export function createTimer(logger: winston.Logger, operation: string) {
  const start = Date.now();

  return {
    end: (success = true, data?: Record<string, unknown>) => {
      const duration = Date.now() - start;
      logger.info({
        message: `${operation} ${success ? 'completed' : 'failed'}`,
        duration,
        success,
        ...data,
      });
    }
  };
}