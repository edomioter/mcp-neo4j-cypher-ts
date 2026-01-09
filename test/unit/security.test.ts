/**
 * Tests for security modules
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { validateQuery, isReadOnlyQuery, containsWriteOperations, sanitizeParameters } from '../../src/security/query-validator.js';
import { checkRateLimit, getRateLimitIdentifier, createRateLimitHeaders } from '../../src/security/ratelimit.js';
import { createMockKV, createMockRequest } from '../setup.js';

describe('Query Validator', () => {
  describe('validateQuery', () => {
    it('should allow simple read queries', () => {
      const result = validateQuery('MATCH (n) RETURN n LIMIT 10');
      expect(result.valid).toBe(true);
      expect(result.queryType).toBe('read');
    });

    it('should allow write queries', () => {
      const result = validateQuery('CREATE (n:Person {name: "Alice"}) RETURN n');
      expect(result.valid).toBe(true);
      expect(result.queryType).toBe('write');
    });

    it('should block DROP DATABASE', () => {
      const result = validateQuery('DROP DATABASE mydb');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('DROP DATABASE');
    });

    it('should block CREATE DATABASE', () => {
      const result = validateQuery('CREATE DATABASE newdb');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('CREATE DATABASE');
    });

    it('should block CREATE USER', () => {
      const result = validateQuery('CREATE USER admin SET PASSWORD "secret"');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('CREATE USER');
    });

    it('should block DROP USER', () => {
      const result = validateQuery('DROP USER someuser');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('DROP USER');
    });

    it('should block GRANT statements', () => {
      const result = validateQuery('GRANT ALL ON DATABASE neo4j TO admin');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('GRANT');
    });

    it('should block REVOKE statements', () => {
      const result = validateQuery('REVOKE READ ON DATABASE neo4j FROM user');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('REVOKE');
    });

    it('should block system DBMS procedures', () => {
      const result = validateQuery('CALL dbms.security.createUser("test", "password")');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('DBMS procedures');
    });

    it('should allow schema inspection procedures', () => {
      const result = validateQuery('CALL db.labels()');
      expect(result.valid).toBe(true);
    });

    it('should block LOAD CSV from remote URLs', () => {
      const result = validateQuery('LOAD CSV FROM "https://evil.com/data.csv" AS row');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('LOAD CSV');
    });

    it('should reject empty queries', () => {
      const result = validateQuery('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('should reject overly long queries', () => {
      const longQuery = 'MATCH (n) ' + 'WHERE n.name = "test" '.repeat(5000);
      const result = validateQuery(longQuery);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('too long');
    });

    it('should handle queries with comments', () => {
      const query = `
        // This is a comment
        MATCH (n)
        /* Multi-line
           comment */
        RETURN n
      `;
      const result = validateQuery(query);
      expect(result.valid).toBe(true);
      expect(result.queryType).toBe('read');
    });
  });

  describe('isReadOnlyQuery', () => {
    it('should return true for MATCH queries', () => {
      expect(isReadOnlyQuery('MATCH (n) RETURN n')).toBe(true);
    });

    it('should return false for CREATE queries', () => {
      expect(isReadOnlyQuery('CREATE (n:Person)')).toBe(false);
    });

    it('should return false for MERGE queries', () => {
      expect(isReadOnlyQuery('MERGE (n:Person {id: 1})')).toBe(false);
    });

    it('should return false for DELETE queries', () => {
      expect(isReadOnlyQuery('MATCH (n) DELETE n')).toBe(false);
    });

    it('should return false for SET queries', () => {
      expect(isReadOnlyQuery('MATCH (n) SET n.name = "test"')).toBe(false);
    });
  });

  describe('containsWriteOperations', () => {
    it('should detect CREATE', () => {
      expect(containsWriteOperations('CREATE (n:Person)')).toBe(true);
    });

    it('should detect MERGE', () => {
      expect(containsWriteOperations('MERGE (n:Person)')).toBe(true);
    });

    it('should detect DELETE', () => {
      expect(containsWriteOperations('MATCH (n) DELETE n')).toBe(true);
    });

    it('should detect SET', () => {
      expect(containsWriteOperations('MATCH (n) SET n.x = 1')).toBe(true);
    });

    it('should detect REMOVE', () => {
      expect(containsWriteOperations('MATCH (n) REMOVE n.x')).toBe(true);
    });

    it('should not detect in read queries', () => {
      expect(containsWriteOperations('MATCH (n) RETURN n')).toBe(false);
    });
  });

  describe('sanitizeParameters', () => {
    it('should pass through valid parameters', () => {
      const params = { name: 'Alice', age: 30, active: true };
      expect(sanitizeParameters(params)).toEqual(params);
    });

    it('should handle null/undefined', () => {
      expect(sanitizeParameters(undefined)).toBeUndefined();
      expect(sanitizeParameters({ x: null })).toEqual({ x: null });
    });

    it('should filter invalid keys', () => {
      const params = { 'valid_key': 1, '123invalid': 2, 'also-invalid': 3 };
      const result = sanitizeParameters(params);
      expect(result).toEqual({ 'valid_key': 1 });
    });

    it('should handle nested objects and arrays', () => {
      const params = { data: { nested: true }, items: [1, 2, 3] };
      expect(sanitizeParameters(params)).toEqual(params);
    });
  });
});

describe('Rate Limiting', () => {
  let mockKv: KVNamespace;

  beforeEach(() => {
    mockKv = createMockKV();
  });

  describe('checkRateLimit', () => {
    it('should allow first request', async () => {
      const result = await checkRateLimit(mockKv, 'user:123', {
        maxRequests: 10,
        windowSeconds: 60,
      });

      expect(result.allowed).toBe(true);
      expect(result.current).toBe(1);
      expect(result.remaining).toBe(9);
    });

    it('should increment counter for same user', async () => {
      await checkRateLimit(mockKv, 'user:123', { maxRequests: 10, windowSeconds: 60 });
      const result = await checkRateLimit(mockKv, 'user:123', { maxRequests: 10, windowSeconds: 60 });

      expect(result.allowed).toBe(true);
      expect(result.current).toBe(2);
    });

    it('should track different users separately', async () => {
      await checkRateLimit(mockKv, 'user:123', { maxRequests: 10, windowSeconds: 60 });
      const result = await checkRateLimit(mockKv, 'user:456', { maxRequests: 10, windowSeconds: 60 });

      expect(result.allowed).toBe(true);
      expect(result.current).toBe(1);
    });

    it('should block when limit exceeded', async () => {
      // Make 5 requests with limit of 3
      for (let i = 0; i < 3; i++) {
        await checkRateLimit(mockKv, 'user:limited', { maxRequests: 3, windowSeconds: 60 });
      }

      const result = await checkRateLimit(mockKv, 'user:limited', { maxRequests: 3, windowSeconds: 60 });

      expect(result.allowed).toBe(false);
      expect(result.current).toBe(4);
      expect(result.remaining).toBe(0);
    });
  });

  describe('getRateLimitIdentifier', () => {
    it('should prefer userId if available', () => {
      const request = createMockRequest('https://example.com/api');
      const id = getRateLimitIdentifier(request, 'user-123');
      expect(id).toBe('user:user-123');
    });

    it('should use CF-Connecting-IP header', () => {
      const request = createMockRequest('https://example.com/api', {
        headers: { 'CF-Connecting-IP': '1.2.3.4' },
      });
      const id = getRateLimitIdentifier(request);
      expect(id).toBe('ip:1.2.3.4');
    });

    it('should use X-Forwarded-For header', () => {
      const request = createMockRequest('https://example.com/api', {
        headers: { 'X-Forwarded-For': '5.6.7.8, 9.10.11.12' },
      });
      const id = getRateLimitIdentifier(request);
      expect(id).toBe('ip:5.6.7.8');
    });

    it('should fallback to anonymous', () => {
      const request = createMockRequest('https://example.com/api');
      const id = getRateLimitIdentifier(request);
      expect(id).toBe('anonymous');
    });
  });

  describe('createRateLimitHeaders', () => {
    it('should create correct headers', () => {
      const headers = createRateLimitHeaders({
        allowed: true,
        current: 5,
        limit: 100,
        remaining: 95,
        resetIn: 30,
      });

      expect(headers['X-RateLimit-Limit']).toBe('100');
      expect(headers['X-RateLimit-Remaining']).toBe('95');
      expect(headers['X-RateLimit-Reset']).toBe('30');
    });
  });

  describe('Lazy Write Optimization (OPT-2)', () => {
    it('should write on first request in window', async () => {
      const mockKv = createMockKV();
      const putSpy = vi.spyOn(mockKv, 'put');

      await checkRateLimit(mockKv, 'user:new', { maxRequests: 100, windowSeconds: 60 });

      // First request should always write
      expect(putSpy).toHaveBeenCalledTimes(1);
    });

    it('should not write when below threshold', async () => {
      const mockKv = createMockKV();

      // First request - this will write (first in window)
      await checkRateLimit(mockKv, 'user:test', { maxRequests: 100, windowSeconds: 60 });

      const putSpy = vi.spyOn(mockKv, 'put');

      // Second request - should not write (count=2, threshold=50, 2 <= 50)
      await checkRateLimit(mockKv, 'user:test', { maxRequests: 100, windowSeconds: 60 });

      // Should not have written since we're below threshold
      expect(putSpy).toHaveBeenCalledTimes(0);
    });

    it('should write when exceeding threshold', async () => {
      const mockKv = createMockKV();

      // First request establishes counter at 1
      await checkRateLimit(mockKv, 'user:high', { maxRequests: 100, windowSeconds: 60 });

      // Manually set KV to simulate 50 requests (at threshold)
      await mockKv.put('rate:user:high', JSON.stringify({ count: 50, window: Math.floor(Date.now() / 1000 / 60) * 60 }));

      const putSpy = vi.spyOn(mockKv, 'put');

      // Next request should trigger a write (count=51 exceeds 50% threshold)
      await checkRateLimit(mockKv, 'user:high', { maxRequests: 100, windowSeconds: 60 });

      expect(putSpy).toHaveBeenCalled();
    });

    it('should still enforce limits when counter is persisted', async () => {
      const mockKv = createMockKV();
      const config = { maxRequests: 5, windowSeconds: 60 };

      // Manually set KV to simulate 5 requests already made
      const currentWindow = Math.floor(Date.now() / 1000 / 60) * 60;
      await mockKv.put('rate:user:limit-test', JSON.stringify({ count: 5, window: currentWindow }));

      // 6th request should be blocked
      const result = await checkRateLimit(mockKv, 'user:limit-test', config);
      expect(result.allowed).toBe(false);
      expect(result.current).toBe(6);
    });

    it('should correctly count requests when writes occur', async () => {
      const mockKv = createMockKV();
      // Use larger limit where lazy write behavior is clearer
      const config = { maxRequests: 10, windowSeconds: 60 };

      // First request (writes)
      const r1 = await checkRateLimit(mockKv, 'user:count-test', config);
      expect(r1.current).toBe(1);
      expect(r1.allowed).toBe(true);

      // Second request (doesn't write, but count increments in memory)
      const r2 = await checkRateLimit(mockKv, 'user:count-test', config);
      expect(r2.current).toBe(2);
      expect(r2.allowed).toBe(true);
    });
  });
});
