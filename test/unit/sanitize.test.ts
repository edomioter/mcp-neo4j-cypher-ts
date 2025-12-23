/**
 * Tests for sanitize.ts
 */

import { describe, it, expect } from 'vitest';
import { sanitize, sanitizeNeo4jResults, isEmbeddingArray } from '../../src/utils/sanitize.js';

describe('sanitize', () => {
  describe('basic sanitization', () => {
    it('should return primitive values unchanged', () => {
      expect(sanitize('hello')).toBe('hello');
      expect(sanitize(42)).toBe(42);
      expect(sanitize(true)).toBe(true);
      expect(sanitize(false)).toBe(false);
    });

    it('should return undefined for null/undefined when removeNulls is true', () => {
      expect(sanitize(null)).toBeUndefined();
      expect(sanitize(undefined)).toBeUndefined();
    });

    it('should keep null/undefined when removeNulls is false', () => {
      expect(sanitize(null, { removeNulls: false })).toBeNull();
      expect(sanitize(undefined, { removeNulls: false })).toBeUndefined();
    });

    it('should sanitize simple objects', () => {
      const input = { name: 'Alice', age: 30 };
      expect(sanitize(input)).toEqual({ name: 'Alice', age: 30 });
    });

    it('should remove null values from objects', () => {
      const input = { name: 'Alice', nickname: null, age: 30 };
      expect(sanitize(input)).toEqual({ name: 'Alice', age: 30 });
    });

    it('should handle nested objects', () => {
      const input = {
        user: {
          name: 'Alice',
          address: {
            city: 'NYC',
            zip: null,
          },
        },
      };
      expect(sanitize(input)).toEqual({
        user: {
          name: 'Alice',
          address: {
            city: 'NYC',
          },
        },
      });
    });
  });

  describe('array handling', () => {
    it('should keep arrays under the limit', () => {
      const input = [1, 2, 3, 4, 5];
      expect(sanitize(input)).toEqual([1, 2, 3, 4, 5]);
    });

    it('should truncate arrays over the default limit (128) with message', () => {
      // Use strings to avoid being detected as embeddings
      const input = Array.from({ length: 200 }, (_, i) => `item-${i}`);
      const result = sanitize(input) as unknown[];

      // Should have 128 items plus truncation message
      expect(result.length).toBe(129);
      expect(result[128]).toContain('more items truncated');
    });

    it('should respect custom maxListSize', () => {
      const input = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const result = sanitize(input, { maxListSize: 5 }) as unknown[];

      // Should have 5 items plus truncation message
      expect(result.length).toBe(6);
      expect(result[5]).toContain('more items truncated');
    });

    it('should sanitize arrays of objects', () => {
      const input = [
        { name: 'Alice', extra: null },
        { name: 'Bob', extra: null },
      ];
      expect(sanitize(input)).toEqual([
        { name: 'Alice' },
        { name: 'Bob' },
      ]);
    });
  });

  describe('embedding detection', () => {
    it('should filter long embedding arrays', () => {
      const input = {
        name: 'Node',
        data: Array.from({ length: 256 }, () => Math.random()),
      };
      const result = sanitize(input) as Record<string, unknown>;

      expect(result.name).toBe('Node');
      expect(result.data).toContain('Embedding array');
      expect(result.data).toContain('256');
    });

    it('should filter properties with embedding-like names', () => {
      const input = {
        name: 'Node',
        embedding: [0.1, 0.2, 0.3], // small but named "embedding"
        vector: [0.1, 0.2, 0.3, 0.4], // small but named "vector"
      };
      const result = sanitize(input) as Record<string, unknown>;

      expect(result.name).toBe('Node');
      expect(result.embedding).toContain('Embedding property');
      expect(result.vector).toContain('Embedding property');
    });

    it('should not filter short non-embedding number arrays', () => {
      const input = {
        scores: [85, 90, 95],
      };
      const result = sanitize(input);
      expect(result).toEqual({
        scores: [85, 90, 95],
      });
    });
  });
});

describe('isEmbeddingArray', () => {
  it('should detect long numeric arrays as embeddings', () => {
    const longArray = Array.from({ length: 128 }, () => Math.random());
    expect(isEmbeddingArray(longArray)).toBe(true);
  });

  it('should not detect short arrays as embeddings', () => {
    const shortArray = [0.1, 0.2, 0.3, 0.4, 0.5];
    expect(isEmbeddingArray(shortArray)).toBe(false);
  });

  it('should not detect small integer arrays as embeddings', () => {
    const small = [1, 2, 3];
    expect(isEmbeddingArray(small)).toBe(false);
  });

  it('should not detect mixed arrays as embeddings', () => {
    const mixed = Array.from({ length: 100 }, (_, i) => i % 2 === 0 ? i : `str${i}`);
    expect(isEmbeddingArray(mixed)).toBe(false);
  });

  it('should not detect empty arrays as embeddings', () => {
    expect(isEmbeddingArray([])).toBe(false);
  });

  it('should detect arrays >= 64 elements with mostly numbers', () => {
    const arr = Array.from({ length: 64 }, (_, i) => i * 0.1);
    expect(isEmbeddingArray(arr)).toBe(true);
  });
});

describe('sanitizeNeo4jResults', () => {
  it('should sanitize an array of result rows', () => {
    const rows = [
      { name: 'Alice', data: Array(128).fill(0.5) },
      { name: 'Bob', data: Array(128).fill(0.5) },
    ];
    const result = sanitizeNeo4jResults(rows) as Array<Record<string, unknown>>;

    expect(result.length).toBe(2);
    expect(result[0].name).toBe('Alice');
    expect(result[0].data).toContain('Embedding array');
    expect(result[1].name).toBe('Bob');
    expect(result[1].data).toContain('Embedding array');
  });

  it('should handle empty rows', () => {
    expect(sanitizeNeo4jResults([])).toEqual([]);
  });

  it('should handle nested structures in rows', () => {
    const rows = [
      {
        node: {
          properties: {
            name: 'Alice',
            largeList: Array(200).fill('x'),
          },
        },
      },
    ];
    const result = sanitizeNeo4jResults(rows) as Array<Record<string, unknown>>;

    const node = result[0].node as Record<string, unknown>;
    const properties = node.properties as Record<string, unknown>;

    expect(properties.name).toBe('Alice');
    expect(Array.isArray(properties.largeList)).toBe(true);
    const largeList = properties.largeList as unknown[];
    expect(largeList[largeList.length - 1]).toContain('more items truncated');
  });
});
