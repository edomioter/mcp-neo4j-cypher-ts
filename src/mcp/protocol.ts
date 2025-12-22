/**
 * MCP Protocol - JSON-RPC 2.0 Parser and Utilities
 *
 * Handles parsing, validation, and response generation for
 * JSON-RPC 2.0 messages according to MCP specification.
 */

import type {
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcSuccessResponse,
  JsonRpcErrorResponse,
  JsonRpcError,
} from '../types.js';
import { ParseError, InvalidRequestError, InvalidParamsError } from '../utils/errors.js';

/**
 * Validate and parse a JSON-RPC 2.0 request
 */
export function parseJsonRpcRequest(body: unknown): JsonRpcRequest {
  // Must be an object
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ParseError('Request body must be a JSON object');
  }

  const request = body as Record<string, unknown>;

  // Validate jsonrpc version
  if (request.jsonrpc !== '2.0') {
    throw new InvalidRequestError('Invalid JSON-RPC version. Must be "2.0"');
  }

  // Validate method
  if (typeof request.method !== 'string' || request.method.length === 0) {
    throw new InvalidRequestError('Method must be a non-empty string');
  }

  // Validate id (can be string, number, or null for notifications)
  const id = request.id;
  if (id !== undefined && id !== null && typeof id !== 'string' && typeof id !== 'number') {
    throw new InvalidRequestError('Request id must be a string, number, or null');
  }

  // Validate params (optional, must be object or array if present)
  const params = request.params;
  if (params !== undefined && typeof params !== 'object') {
    throw new InvalidParamsError('Params must be an object or array');
  }

  return {
    jsonrpc: '2.0',
    id: id ?? null,
    method: request.method,
    params: params as Record<string, unknown> | undefined,
  };
}

/**
 * Check if request is a notification (no id means no response expected)
 */
export function isNotification(request: JsonRpcRequest): boolean {
  return request.id === null || request.id === undefined;
}

/**
 * Create a JSON-RPC 2.0 success response
 */
export function createSuccessResponse(
  id: string | number | null,
  result: unknown
): JsonRpcSuccessResponse {
  return {
    jsonrpc: '2.0',
    id,
    result,
  };
}

/**
 * Create a JSON-RPC 2.0 error response
 */
export function createErrorResponse(
  id: string | number | null,
  error: JsonRpcError
): JsonRpcErrorResponse {
  return {
    jsonrpc: '2.0',
    id,
    error,
  };
}

/**
 * Serialize a JSON-RPC response to string
 */
export function serializeResponse(response: JsonRpcResponse): string {
  return JSON.stringify(response);
}

/**
 * Create a success response and serialize it
 */
export function jsonRpcSuccess(id: string | number | null, result: unknown): string {
  return serializeResponse(createSuccessResponse(id, result));
}

/**
 * Create an error response and serialize it
 */
export function jsonRpcError(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown
): string {
  const error: JsonRpcError = { code, message };
  if (data !== undefined) {
    error.data = data;
  }
  return serializeResponse(createErrorResponse(id, error));
}

/**
 * Extract a required string parameter from params
 */
export function getRequiredStringParam(
  params: Record<string, unknown> | undefined,
  name: string
): string {
  if (!params || typeof params[name] !== 'string') {
    throw new InvalidParamsError(`Missing required parameter: ${name}`);
  }
  return params[name] as string;
}

/**
 * Extract an optional string parameter from params
 */
export function getOptionalStringParam(
  params: Record<string, unknown> | undefined,
  name: string,
  defaultValue?: string
): string | undefined {
  if (!params || params[name] === undefined) {
    return defaultValue;
  }
  if (typeof params[name] !== 'string') {
    throw new InvalidParamsError(`Parameter ${name} must be a string`);
  }
  return params[name] as string;
}

/**
 * Extract an optional number parameter from params
 */
export function getOptionalNumberParam(
  params: Record<string, unknown> | undefined,
  name: string,
  defaultValue?: number
): number | undefined {
  if (!params || params[name] === undefined) {
    return defaultValue;
  }
  if (typeof params[name] !== 'number') {
    throw new InvalidParamsError(`Parameter ${name} must be a number`);
  }
  return params[name] as number;
}

/**
 * Extract an optional object parameter from params
 */
export function getOptionalObjectParam(
  params: Record<string, unknown> | undefined,
  name: string
): Record<string, unknown> | undefined {
  if (!params || params[name] === undefined) {
    return undefined;
  }
  if (typeof params[name] !== 'object' || params[name] === null || Array.isArray(params[name])) {
    throw new InvalidParamsError(`Parameter ${name} must be an object`);
  }
  return params[name] as Record<string, unknown>;
}

/**
 * Validate tool call params structure
 */
export function validateToolCallParams(
  params: Record<string, unknown> | undefined
): { name: string; arguments?: Record<string, unknown> } {
  if (!params) {
    throw new InvalidParamsError('Missing params for tools/call');
  }

  const name = params.name;
  if (typeof name !== 'string' || name.length === 0) {
    throw new InvalidParamsError('Tool name must be a non-empty string');
  }

  const args = params.arguments;
  if (args !== undefined && (typeof args !== 'object' || args === null || Array.isArray(args))) {
    throw new InvalidParamsError('Tool arguments must be an object');
  }

  return {
    name,
    arguments: args as Record<string, unknown> | undefined,
  };
}
