/**
 * Tests for neo4j/client.ts
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createNeo4jClient } from '../../src/neo4j/client.js';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('Neo4jClient', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const testConnection = {
    uri: 'neo4j+s://test.databases.neo4j.io',
    username: 'neo4j',
    password: 'password123',
    database: 'neo4j',
  };

  describe('testConnection', () => {
    it('should return true for successful connection', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { fields: ['test'], values: [[1]] },
        }),
      });

      const client = createNeo4jClient(testConnection);
      const result = await client.testConnection();

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should return false for failed connection', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Unauthorized',
      });

      const client = createNeo4jClient(testConnection);
      const result = await client.testConnection();

      expect(result).toBe(false);
    });

    it('should return false for network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const client = createNeo4jClient(testConnection);
      const result = await client.testConnection();

      expect(result).toBe(false);
    });
  });

  describe('query', () => {
    it('should execute a query and return results', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: {
            fields: ['name', 'age'],
            values: [['Alice', 30], ['Bob', 25]],
          },
          counters: {},
        }),
      });

      const client = createNeo4jClient(testConnection);
      const result = await client.query('MATCH (n:Person) RETURN n.name, n.age');

      expect(result.data.fields).toEqual(['name', 'age']);
      expect(result.data.values).toHaveLength(2);
    });

    it('should pass parameters to the query', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { fields: ['n'], values: [] },
          counters: {},
        }),
      });

      const client = createNeo4jClient(testConnection);
      await client.query('MATCH (n) WHERE n.id = $id RETURN n', { id: 123 });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"parameters":{"id":123}'),
        })
      );
    });

    it('should include Authorization header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { fields: [], values: [] },
          counters: {},
        }),
      });

      const client = createNeo4jClient(testConnection);
      await client.query('RETURN 1');

      const expectedAuth = 'Basic ' + btoa('neo4j:password123');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: expectedAuth,
          }),
        })
      );
    });

    it('should throw error for failed query', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () => JSON.stringify({
          errors: [{ message: 'Invalid query syntax', code: 'Neo.ClientError.Statement.SyntaxError' }],
        }),
      });

      const client = createNeo4jClient(testConnection);

      await expect(
        client.query('INVALID QUERY')
      ).rejects.toThrow();
    });

    it('should use correct database in URL', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { fields: [], values: [] },
          counters: {},
        }),
      });

      const client = createNeo4jClient({
        ...testConnection,
        database: 'mydb',
      });
      await client.query('RETURN 1');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/db/mydb/query/v2'),
        expect.anything()
      );
    });
  });

  describe('URI conversion', () => {
    // Test URI conversion indirectly through fetch URL
    it('should convert neo4j+s:// to https://', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { fields: [], values: [] } }),
      });

      const client = createNeo4jClient({
        uri: 'neo4j+s://abc123.databases.neo4j.io',
        username: 'user',
        password: 'pass',
        database: 'neo4j',
      });
      await client.query('RETURN 1');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('https://abc123.databases.neo4j.io'),
        expect.anything()
      );
    });

    it('should convert bolt:// to http:// and change port', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { fields: [], values: [] } }),
      });

      const client = createNeo4jClient({
        uri: 'bolt://localhost:7687',
        username: 'user',
        password: 'pass',
        database: 'neo4j',
      });
      await client.query('RETURN 1');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('http://localhost:7474'),
        expect.anything()
      );
    });
  });

  describe('options', () => {
    it('should use default timeout', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { fields: [], values: [] },
          counters: {},
        }),
      });

      const client = createNeo4jClient(testConnection, { defaultTimeout: 60 });
      await client.query('RETURN 1');

      expect(mockFetch).toHaveBeenCalled();
    });
  });
});
