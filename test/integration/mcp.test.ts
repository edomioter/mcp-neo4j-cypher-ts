/**
 * Integration tests for MCP protocol flow
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { routeRequest, type HandlerContext } from '../../src/mcp/handlers.js';
import { parseJsonRpcRequest } from '../../src/mcp/protocol.js';
import { createMockEnv, createMcpRequest } from '../setup.js';

describe('MCP Protocol Integration', () => {
  let mockEnv: ReturnType<typeof createMockEnv>;
  let baseContext: HandlerContext;

  beforeEach(() => {
    mockEnv = createMockEnv();
    baseContext = {
      env: mockEnv,
      requestId: 'test-request-123',
      readOnly: false,
      timeout: 30,
      tokenLimit: 10000,
      schemaSampleSize: 1000,
    };
  });

  describe('initialize', () => {
    it('should return server info and capabilities', async () => {
      const request = parseJsonRpcRequest(createMcpRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'test-client', version: '1.0.0' },
      }));

      const result = await routeRequest(request, baseContext);

      expect(result.type).toBe('response');
      if (result.type === 'response') {
        const response = result.result as Record<string, unknown>;
        expect(response.protocolVersion).toBe('2024-11-05');
        expect(response.serverInfo).toEqual({
          name: 'mcp-neo4j-cypher',
          version: '1.0.0',
        });
        expect(response.capabilities).toHaveProperty('tools');
      }
    });
  });

  describe('notifications/initialized', () => {
    it('should acknowledge without response', async () => {
      const request = parseJsonRpcRequest({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      });

      const result = await routeRequest(request, baseContext);

      expect(result.type).toBe('notification');
    });
  });

  describe('tools/list', () => {
    it('should return all tools when not read-only', async () => {
      const request = parseJsonRpcRequest(createMcpRequest('tools/list', {}));

      const result = await routeRequest(request, baseContext);

      expect(result.type).toBe('response');
      if (result.type === 'response') {
        const response = result.result as { tools: Array<{ name: string }> };
        expect(response.tools).toHaveLength(3);
        expect(response.tools.map(t => t.name)).toContain('get_neo4j_schema');
        expect(response.tools.map(t => t.name)).toContain('read_neo4j_cypher');
        expect(response.tools.map(t => t.name)).toContain('write_neo4j_cypher');
      }
    });

    it('should hide write tool when read-only', async () => {
      const readOnlyContext = { ...baseContext, readOnly: true };
      const request = parseJsonRpcRequest(createMcpRequest('tools/list', {}));

      const result = await routeRequest(request, readOnlyContext);

      expect(result.type).toBe('response');
      if (result.type === 'response') {
        const response = result.result as { tools: Array<{ name: string }> };
        expect(response.tools).toHaveLength(2);
        expect(response.tools.map(t => t.name)).not.toContain('write_neo4j_cypher');
      }
    });
  });

  describe('tools/call', () => {
    describe('get_neo4j_schema', () => {
      it('should return error when no neo4j client', async () => {
        const request = parseJsonRpcRequest(createMcpRequest('tools/call', {
          name: 'get_neo4j_schema',
          arguments: {},
        }));

        const result = await routeRequest(request, baseContext);

        expect(result.type).toBe('response');
        if (result.type === 'response') {
          const response = result.result as { content: Array<{ text: string }>, isError?: boolean };
          expect(response.isError).toBe(true);
          expect(response.content[0].text).toContain('No Neo4j connection');
        }
      });
    });

    describe('read_neo4j_cypher', () => {
      it('should return error when no neo4j client', async () => {
        const request = parseJsonRpcRequest(createMcpRequest('tools/call', {
          name: 'read_neo4j_cypher',
          arguments: { query: 'MATCH (n) RETURN n LIMIT 10' },
        }));

        const result = await routeRequest(request, baseContext);

        expect(result.type).toBe('response');
        if (result.type === 'response') {
          const response = result.result as { content: Array<{ text: string }>, isError?: boolean };
          expect(response.isError).toBe(true);
          expect(response.content[0].text).toContain('No Neo4j connection');
        }
      });

      it('should reject write queries', async () => {
        const request = parseJsonRpcRequest(createMcpRequest('tools/call', {
          name: 'read_neo4j_cypher',
          arguments: { query: 'CREATE (n:Test) RETURN n' },
        }));

        const result = await routeRequest(request, baseContext);

        expect(result.type).toBe('error');
      });

      it('should require query parameter', async () => {
        const request = parseJsonRpcRequest(createMcpRequest('tools/call', {
          name: 'read_neo4j_cypher',
          arguments: {},
        }));

        const result = await routeRequest(request, baseContext);

        expect(result.type).toBe('error');
      });
    });

    describe('write_neo4j_cypher', () => {
      it('should return error when read-only', async () => {
        const readOnlyContext = { ...baseContext, readOnly: true };
        const request = parseJsonRpcRequest(createMcpRequest('tools/call', {
          name: 'write_neo4j_cypher',
          arguments: { query: 'CREATE (n:Test) RETURN n' },
        }));

        const result = await routeRequest(request, readOnlyContext);

        expect(result.type).toBe('response');
        if (result.type === 'response') {
          const response = result.result as { content: Array<{ text: string }>, isError?: boolean };
          expect(response.isError).toBe(true);
          expect(response.content[0].text).toContain('Write operations disabled');
        }
      });

      it('should return error when no neo4j client', async () => {
        const request = parseJsonRpcRequest(createMcpRequest('tools/call', {
          name: 'write_neo4j_cypher',
          arguments: { query: 'CREATE (n:Test) RETURN n' },
        }));

        const result = await routeRequest(request, baseContext);

        expect(result.type).toBe('response');
        if (result.type === 'response') {
          const response = result.result as { content: Array<{ text: string }>, isError?: boolean };
          expect(response.isError).toBe(true);
          expect(response.content[0].text).toContain('No Neo4j connection');
        }
      });
    });

    describe('unknown tool', () => {
      it('should return error for unknown tool', async () => {
        const request = parseJsonRpcRequest(createMcpRequest('tools/call', {
          name: 'unknown_tool',
          arguments: {},
        }));

        const result = await routeRequest(request, baseContext);

        expect(result.type).toBe('error');
      });
    });
  });

  describe('ping', () => {
    it('should respond to ping', async () => {
      const request = parseJsonRpcRequest(createMcpRequest('ping', {}));

      const result = await routeRequest(request, baseContext);

      expect(result.type).toBe('response');
      if (result.type === 'response') {
        expect(result.result).toEqual({});
      }
    });
  });

  describe('unknown method', () => {
    it('should return error for unknown method', async () => {
      const request = parseJsonRpcRequest(createMcpRequest('unknown/method', {}));

      const result = await routeRequest(request, baseContext);

      expect(result.type).toBe('error');
    });
  });
});
