/**
 * Error Classes and Utilities
 *
 * Typed error classes for consistent error handling throughout
 * the application.
 */

import { JSON_RPC_ERROR_CODES, type JsonRpcError } from '../types.js';

/**
 * Base error class for MCP server errors
 */
export class McpError extends Error {
  public readonly code: number;
  public readonly data?: unknown;

  constructor(message: string, code: number, data?: unknown) {
    super(message);
    this.name = 'McpError';
    this.code = code;
    this.data = data;

    // Maintains proper stack trace for where our error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, McpError);
    }
  }

  /**
   * Convert to JSON-RPC error format
   */
  toJsonRpcError(): JsonRpcError {
    return {
      code: this.code,
      message: this.message,
      ...(this.data !== undefined && { data: this.data }),
    };
  }
}

/**
 * JSON-RPC Parse Error (-32700)
 */
export class ParseError extends McpError {
  constructor(message = 'Parse error: Invalid JSON') {
    super(message, JSON_RPC_ERROR_CODES.PARSE_ERROR);
    this.name = 'ParseError';
  }
}

/**
 * JSON-RPC Invalid Request Error (-32600)
 */
export class InvalidRequestError extends McpError {
  constructor(message = 'Invalid Request') {
    super(message, JSON_RPC_ERROR_CODES.INVALID_REQUEST);
    this.name = 'InvalidRequestError';
  }
}

/**
 * JSON-RPC Method Not Found Error (-32601)
 */
export class MethodNotFoundError extends McpError {
  constructor(method: string) {
    super(`Method not found: ${method}`, JSON_RPC_ERROR_CODES.METHOD_NOT_FOUND);
    this.name = 'MethodNotFoundError';
  }
}

/**
 * JSON-RPC Invalid Params Error (-32602)
 */
export class InvalidParamsError extends McpError {
  constructor(message = 'Invalid params') {
    super(message, JSON_RPC_ERROR_CODES.INVALID_PARAMS);
    this.name = 'InvalidParamsError';
  }
}

/**
 * JSON-RPC Internal Error (-32603)
 */
export class InternalError extends McpError {
  constructor(message = 'Internal error') {
    super(message, JSON_RPC_ERROR_CODES.INTERNAL_ERROR);
    this.name = 'InternalError';
  }
}

/**
 * Neo4j Connection Error (-32001)
 */
export class Neo4jConnectionError extends McpError {
  constructor(message = 'Failed to connect to Neo4j') {
    super(message, JSON_RPC_ERROR_CODES.NEO4J_CONNECTION_ERROR);
    this.name = 'Neo4jConnectionError';
  }
}

/**
 * Neo4j Query Error (-32002)
 */
export class Neo4jQueryError extends McpError {
  public readonly neo4jCode?: string;

  constructor(message: string, neo4jCode?: string) {
    super(message, JSON_RPC_ERROR_CODES.NEO4J_QUERY_ERROR, { neo4jCode });
    this.name = 'Neo4jQueryError';
    this.neo4jCode = neo4jCode;
  }
}

/**
 * Authentication Error (-32003)
 */
export class AuthenticationError extends McpError {
  constructor(message = 'Authentication required') {
    super(message, JSON_RPC_ERROR_CODES.AUTHENTICATION_ERROR);
    this.name = 'AuthenticationError';
  }
}

/**
 * Rate Limit Error (-32004)
 */
export class RateLimitError extends McpError {
  public readonly retryAfter: number;

  constructor(retryAfter: number) {
    super(`Rate limit exceeded. Retry after ${retryAfter} seconds`, JSON_RPC_ERROR_CODES.RATE_LIMIT_ERROR, {
      retryAfter,
    });
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

/**
 * Validation Error (-32005)
 */
export class ValidationError extends McpError {
  constructor(message: string, details?: unknown) {
    super(message, JSON_RPC_ERROR_CODES.VALIDATION_ERROR, details);
    this.name = 'ValidationError';
  }
}

/**
 * Convert any error to McpError
 */
export function toMcpError(error: unknown): McpError {
  if (error instanceof McpError) {
    return error;
  }

  if (error instanceof Error) {
    return new InternalError(error.message);
  }

  return new InternalError(String(error));
}

/**
 * Create a JSON-RPC error response
 */
export function createJsonRpcErrorResponse(
  id: string | number | null,
  error: McpError | JsonRpcError
): string {
  const jsonRpcError = error instanceof McpError ? error.toJsonRpcError() : error;

  return JSON.stringify({
    jsonrpc: '2.0',
    id,
    error: jsonRpcError,
  });
}
