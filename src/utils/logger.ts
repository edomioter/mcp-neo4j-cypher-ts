/**
 * Structured Logging Utilities
 *
 * Provides JSON-structured logging for Cloudflare Workers
 * with support for different log levels and contextual data.
 */

import type { LogEntry } from '../types.js';

/**
 * Log levels with numeric priority
 */
const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
} as const;

type LogLevel = keyof typeof LOG_LEVELS;

/**
 * Current minimum log level (can be configured per environment)
 */
let currentLogLevel: LogLevel = 'info';

/**
 * Set the minimum log level
 */
export function setLogLevel(level: LogLevel): void {
  currentLogLevel = level;
}

/**
 * Check if a log level should be output
 */
function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLogLevel];
}

/**
 * Create a log entry and output to console
 */
function log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  if (!shouldLog(level)) {
    return;
  }

  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(context && { context }),
  };

  const output = JSON.stringify(entry);

  switch (level) {
    case 'debug':
    case 'info':
      console.log(output);
      break;
    case 'warn':
      console.warn(output);
      break;
    case 'error':
      console.error(output);
      break;
  }
}

/**
 * Log debug message
 */
export function debug(message: string, context?: Record<string, unknown>): void {
  log('debug', message, context);
}

/**
 * Log info message
 */
export function info(message: string, context?: Record<string, unknown>): void {
  log('info', message, context);
}

/**
 * Log warning message
 */
export function warn(message: string, context?: Record<string, unknown>): void {
  log('warn', message, context);
}

/**
 * Log error message
 */
export function error(message: string, context?: Record<string, unknown>): void {
  log('error', message, context);
}

/**
 * Log an HTTP request
 */
export function logRequest(
  request: Request,
  context?: {
    userId?: string;
    method?: string;
    duration?: number;
    status?: number;
  }
): void {
  info('HTTP Request', {
    httpMethod: request.method,
    url: request.url,
    userAgent: request.headers.get('user-agent') ?? undefined,
    ...context,
  });
}

/**
 * Log an HTTP response
 */
export function logResponse(
  request: Request,
  response: Response,
  startTime: number
): void {
  const duration = Date.now() - startTime;

  info('HTTP Response', {
    httpMethod: request.method,
    url: request.url,
    status: response.status,
    duration,
  });
}

/**
 * Log an MCP method call
 */
export function logMcpCall(
  method: string,
  context?: {
    userId?: string;
    requestId?: string | number | null;
    params?: Record<string, unknown>;
  }
): void {
  info('MCP Method Call', {
    method,
    ...context,
  });
}

/**
 * Log a Neo4j query execution
 */
export function logNeo4jQuery(
  query: string,
  context?: {
    userId?: string;
    duration?: number;
    success?: boolean;
    error?: string;
  }
): void {
  // Truncate query for logging (avoid huge queries in logs)
  const truncatedQuery = query.length > 200 ? query.substring(0, 200) + '...' : query;

  info('Neo4j Query', {
    query: truncatedQuery,
    ...context,
  });
}

/**
 * Log an error with stack trace
 */
export function logError(err: Error, context?: Record<string, unknown>): void {
  error(err.message, {
    name: err.name,
    stack: err.stack,
    ...context,
  });
}

/**
 * Create a request-scoped logger
 */
export function createRequestLogger(requestId: string) {
  return {
    debug: (message: string, context?: Record<string, unknown>) =>
      debug(message, { requestId, ...context }),
    info: (message: string, context?: Record<string, unknown>) =>
      info(message, { requestId, ...context }),
    warn: (message: string, context?: Record<string, unknown>) =>
      warn(message, { requestId, ...context }),
    error: (message: string, context?: Record<string, unknown>) =>
      error(message, { requestId, ...context }),
  };
}
