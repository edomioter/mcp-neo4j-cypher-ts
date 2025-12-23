/**
 * Tests for protocol.ts
 */

import { describe, it, expect } from 'vitest';
import {
  parseJsonRpcRequest,
  jsonRpcSuccess,
  jsonRpcError,
  isNotification,
  validateToolCallParams,
} from '../../src/mcp/protocol.js';
import { createMcpRequest } from '../setup.js';

describe('parseJsonRpcRequest', () => {
  it('should parse a valid JSON-RPC request', () => {
    const input = createMcpRequest('initialize', { capabilities: {} }, 1);
    const result = parseJsonRpcRequest(input);

    expect(result.jsonrpc).toBe('2.0');
    expect(result.method).toBe('initialize');
    expect(result.params).toEqual({ capabilities: {} });
    expect(result.id).toBe(1);
  });

  it('should parse request without params', () => {
    const input = { jsonrpc: '2.0', method: 'ping', id: 1 };
    const result = parseJsonRpcRequest(input);

    expect(result.method).toBe('ping');
    expect(result.params).toBeUndefined();
  });

  it('should parse notification (no id)', () => {
    const input = { jsonrpc: '2.0', method: 'notifications/initialized' };
    const result = parseJsonRpcRequest(input);

    expect(result.method).toBe('notifications/initialized');
    expect(result.id).toBeNull(); // undefined becomes null
  });

  it('should throw ParseError for non-object input', () => {
    expect(() => parseJsonRpcRequest(null)).toThrow();
    expect(() => parseJsonRpcRequest('string')).toThrow();
    expect(() => parseJsonRpcRequest(123)).toThrow();
  });

  it('should throw ParseError for missing jsonrpc', () => {
    expect(() => parseJsonRpcRequest({ method: 'test' })).toThrow();
  });

  it('should throw ParseError for wrong jsonrpc version', () => {
    expect(() => parseJsonRpcRequest({ jsonrpc: '1.0', method: 'test' })).toThrow();
  });

  it('should throw ParseError for missing method', () => {
    expect(() => parseJsonRpcRequest({ jsonrpc: '2.0' })).toThrow();
  });

  it('should throw ParseError for non-string method', () => {
    expect(() => parseJsonRpcRequest({ jsonrpc: '2.0', method: 123 })).toThrow();
  });

  it('should accept string id', () => {
    const input = { jsonrpc: '2.0', method: 'test', id: 'abc-123' };
    const result = parseJsonRpcRequest(input);

    expect(result.id).toBe('abc-123');
  });
});

describe('jsonRpcSuccess', () => {
  it('should create success response with numeric id', () => {
    const response = jsonRpcSuccess(1, { data: 'test' });
    const parsed = JSON.parse(response);

    expect(parsed).toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: { data: 'test' },
    });
  });

  it('should create success response with string id', () => {
    const response = jsonRpcSuccess('abc', { data: 'test' });
    const parsed = JSON.parse(response);

    expect(parsed.id).toBe('abc');
  });

  it('should create success response with null id', () => {
    const response = jsonRpcSuccess(null, { data: 'test' });
    const parsed = JSON.parse(response);

    expect(parsed.id).toBeNull();
  });

  it('should handle complex result objects', () => {
    const result = {
      tools: [
        { name: 'tool1', description: 'desc1' },
        { name: 'tool2', description: 'desc2' },
      ],
    };
    const response = jsonRpcSuccess(1, result);
    const parsed = JSON.parse(response);

    expect(parsed.result).toEqual(result);
  });
});

describe('jsonRpcError', () => {
  it('should create error response', () => {
    const response = jsonRpcError(1, -32600, 'Invalid Request');
    const parsed = JSON.parse(response);

    expect(parsed).toEqual({
      jsonrpc: '2.0',
      id: 1,
      error: {
        code: -32600,
        message: 'Invalid Request',
      },
    });
  });

  it('should include error data if provided', () => {
    const response = jsonRpcError(1, -32600, 'Invalid Request', { detail: 'extra info' });
    const parsed = JSON.parse(response);

    expect(parsed.error.data).toEqual({ detail: 'extra info' });
  });

  it('should handle null id', () => {
    const response = jsonRpcError(null, -32700, 'Parse error');
    const parsed = JSON.parse(response);

    expect(parsed.id).toBeNull();
  });
});

describe('isNotification', () => {
  it('should return true for request without id', () => {
    const request = parseJsonRpcRequest({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    });

    expect(isNotification(request)).toBe(true);
  });

  it('should return false for request with id', () => {
    const request = parseJsonRpcRequest({
      jsonrpc: '2.0',
      method: 'initialize',
      id: 1,
    });

    expect(isNotification(request)).toBe(false);
  });

  it('should return true for request with null id', () => {
    // In JSON-RPC 2.0, null id is treated as notification (no response expected)
    const request = { jsonrpc: '2.0', method: 'test', id: null } as const;
    const parsed = parseJsonRpcRequest(request);

    expect(isNotification(parsed)).toBe(true);
  });
});

describe('validateToolCallParams', () => {
  it('should validate valid tool call params', () => {
    const params = { name: 'get_neo4j_schema', arguments: { sample_size: 1000 } };
    const result = validateToolCallParams(params);

    expect(result.name).toBe('get_neo4j_schema');
    expect(result.arguments).toEqual({ sample_size: 1000 });
  });

  it('should handle params without arguments', () => {
    const params = { name: 'get_neo4j_schema' };
    const result = validateToolCallParams(params);

    expect(result.name).toBe('get_neo4j_schema');
    expect(result.arguments).toBeUndefined();
  });

  it('should throw for missing name', () => {
    expect(() => validateToolCallParams({})).toThrow();
    expect(() => validateToolCallParams({ arguments: {} })).toThrow();
  });

  it('should throw for non-string name', () => {
    expect(() => validateToolCallParams({ name: 123 })).toThrow();
  });

  it('should throw for null/undefined params', () => {
    expect(() => validateToolCallParams(null)).toThrow();
    expect(() => validateToolCallParams(undefined)).toThrow();
  });

  it('should handle complex arguments', () => {
    const params = {
      name: 'read_neo4j_cypher',
      arguments: {
        query: 'MATCH (n) RETURN n',
        params: { limit: 10 },
      },
    };
    const result = validateToolCallParams(params);

    expect(result.arguments).toEqual({
      query: 'MATCH (n) RETURN n',
      params: { limit: 10 },
    });
  });
});
