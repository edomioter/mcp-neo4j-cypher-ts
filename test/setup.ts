/**
 * Test Setup
 *
 * Global setup for Vitest tests including mocks for Cloudflare bindings.
 */

import { vi } from 'vitest';

// Mock crypto for Node.js environment
if (typeof globalThis.crypto === 'undefined') {
  const { webcrypto } = await import('crypto');
  globalThis.crypto = webcrypto as Crypto;
}

// Mock KV Namespace
export function createMockKV(): KVNamespace {
  const store = new Map<string, { value: string; metadata?: unknown }>();

  return {
    get: vi.fn(async (key: string, options?: string | { type?: string }) => {
      const entry = store.get(key);
      if (!entry) return null;
      // Handle both kv.get(key, 'json') and kv.get(key, { type: 'json' })
      const typeOption = typeof options === 'string' ? options : options?.type;
      if (typeOption === 'json') {
        return JSON.parse(entry.value);
      }
      return entry.value;
    }),
    put: vi.fn(async (key: string, value: string, options?: { expirationTtl?: number; metadata?: unknown }) => {
      store.set(key, { value, metadata: options?.metadata });
    }),
    delete: vi.fn(async (key: string) => {
      store.delete(key);
    }),
    list: vi.fn(async () => ({
      keys: Array.from(store.keys()).map(name => ({ name })),
      list_complete: true,
      cacheStatus: null,
    })),
    getWithMetadata: vi.fn(async (key: string) => {
      const entry = store.get(key);
      if (!entry) return { value: null, metadata: null };
      return { value: entry.value, metadata: entry.metadata };
    }),
  } as unknown as KVNamespace;
}

// Mock D1 Database
export function createMockD1(): D1Database {
  const tables: Record<string, Record<string, unknown>[]> = {
    users: [],
    connections: [],
  };

  return {
    prepare: vi.fn((query: string) => ({
      bind: vi.fn((..._args: unknown[]) => ({
        run: vi.fn(async () => {
          // Simulate INSERT
          if (query.toUpperCase().includes('INSERT')) {
            return { success: true, meta: { changes: 1 } };
          }
          // Simulate UPDATE
          if (query.toUpperCase().includes('UPDATE')) {
            return { success: true, meta: { changes: 1 } };
          }
          // Simulate DELETE
          if (query.toUpperCase().includes('DELETE')) {
            return { success: true, meta: { changes: 1 } };
          }
          return { success: true, meta: { changes: 0 } };
        }),
        first: vi.fn(async () => {
          // Return mock data for SELECT
          if (query.toUpperCase().includes('SELECT')) {
            return null; // Override in specific tests
          }
          return null;
        }),
        all: vi.fn(async () => ({
          results: [],
          success: true,
        })),
      })),
      run: vi.fn(async () => ({ success: true, meta: { changes: 0 } })),
      first: vi.fn(async () => null),
      all: vi.fn(async () => ({ results: [], success: true })),
    })),
    exec: vi.fn(async () => ({ count: 0, duration: 0 })),
    batch: vi.fn(async () => []),
    dump: vi.fn(async () => new ArrayBuffer(0)),
  } as unknown as D1Database;
}

// Mock Env
export function createMockEnv() {
  return {
    DB: createMockD1(),
    SESSIONS: createMockKV(),
    ENVIRONMENT: 'test',
    ENCRYPTION_KEY: 'test-encryption-key-32-bytes-ok!',
    DEFAULT_READ_TIMEOUT: '30',
    DEFAULT_TOKEN_LIMIT: '10000',
    DEFAULT_SCHEMA_SAMPLE: '1000',
    ALLOWED_ORIGINS: 'https://claude.ai',
  };
}

// Helper to create mock Request
export function createMockRequest(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  } = {}
): Request {
  const { method = 'GET', headers = {}, body } = options;

  return new Request(url, {
    method,
    headers: new Headers(headers),
    body: body ? JSON.stringify(body) : undefined,
  });
}

// Helper to create MCP JSON-RPC request
export function createMcpRequest(
  method: string,
  params?: unknown,
  id: number | string = 1
): { jsonrpc: string; method: string; params?: unknown; id: number | string } {
  return {
    jsonrpc: '2.0',
    method,
    ...(params !== undefined && { params }),
    id,
  };
}
