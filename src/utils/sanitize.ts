/**
 * Data Sanitization Utilities
 *
 * Functions to clean and sanitize data before sending to LLMs.
 * This helps reduce context size and remove irrelevant information.
 *
 * Based on the original Python implementation in mcp-neo4j-cypher.
 */

import { DEFAULTS } from '../config/constants.js';

/**
 * Configuration options for sanitization
 */
export interface SanitizeOptions {
  /** Maximum list size before filtering (default: 128) */
  maxListSize?: number;
  /** Whether to remove embedding-like arrays (default: true) */
  removeEmbeddings?: boolean;
  /** Whether to remove null/undefined values (default: true) */
  removeNulls?: boolean;
  /** Maximum string length before truncation (default: no limit) */
  maxStringLength?: number;
  /** Maximum object depth for recursion (default: 20) */
  maxDepth?: number;
}

/**
 * Default sanitization options
 */
const DEFAULT_OPTIONS: Required<SanitizeOptions> = {
  maxListSize: DEFAULTS.MAX_LIST_SIZE,
  removeEmbeddings: true,
  removeNulls: true,
  maxStringLength: 0, // 0 means no limit
  maxDepth: 20,
};

/**
 * Check if an array looks like an embedding vector
 *
 * Embeddings are typically:
 * - Long arrays (usually 128+ elements)
 * - Contain only numbers (floats)
 * - Numbers are typically between -1 and 1 or small values
 *
 * @param arr - Array to check
 * @returns true if the array appears to be an embedding
 */
export function isEmbeddingArray(arr: unknown[]): boolean {
  // Must be a long array
  if (arr.length < 64) {
    return false;
  }

  // Check first 10 elements to determine if it's numeric
  const sampleSize = Math.min(10, arr.length);
  let numericCount = 0;

  for (let i = 0; i < sampleSize; i++) {
    const value = arr[i];
    if (typeof value === 'number' && !Number.isNaN(value)) {
      numericCount++;
    }
  }

  // If most values are numbers, it's likely an embedding
  return numericCount >= sampleSize * 0.8;
}

/**
 * Check if a key name suggests it contains an embedding
 *
 * @param key - Property key name
 * @returns true if the key suggests an embedding
 */
export function isEmbeddingKey(key: string): boolean {
  const lowerKey = key.toLowerCase();
  const embeddingPatterns = [
    'embedding',
    'embeddings',
    'vector',
    'vectors',
    'embed',
    'encoding',
    'encodings',
    'feature_vector',
    'featurevector',
  ];

  return embeddingPatterns.some(pattern => lowerKey.includes(pattern));
}

/**
 * Sanitize a single value
 *
 * Processes a value recursively, applying sanitization rules.
 *
 * @param value - Value to sanitize
 * @param options - Sanitization options
 * @param depth - Current recursion depth
 * @returns Sanitized value or undefined if should be removed
 */
export function sanitizeValue(
  value: unknown,
  options: Required<SanitizeOptions> = DEFAULT_OPTIONS,
  depth: number = 0
): unknown {
  // Prevent infinite recursion
  if (depth > options.maxDepth) {
    return '[Max depth exceeded]';
  }

  // Handle null/undefined
  if (value === null || value === undefined) {
    return options.removeNulls ? undefined : value;
  }

  // Handle primitives
  if (typeof value === 'string') {
    if (options.maxStringLength > 0 && value.length > options.maxStringLength) {
      return value.substring(0, options.maxStringLength) + '...[truncated]';
    }
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  // Handle arrays
  if (Array.isArray(value)) {
    // Check for embeddings
    if (options.removeEmbeddings && isEmbeddingArray(value)) {
      return `[Embedding array with ${value.length} dimensions - filtered]`;
    }

    // Filter long lists
    if (value.length > options.maxListSize) {
      const truncated = value.slice(0, options.maxListSize);
      const sanitized = truncated
        .map(item => sanitizeValue(item, options, depth + 1))
        .filter(item => item !== undefined);

      return [
        ...sanitized,
        `...[${value.length - options.maxListSize} more items truncated]`,
      ];
    }

    // Sanitize each element
    return value
      .map(item => sanitizeValue(item, options, depth + 1))
      .filter(item => item !== undefined);
  }

  // Handle objects
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    const obj = value as Record<string, unknown>;

    for (const [key, val] of Object.entries(obj)) {
      // Skip embedding keys entirely
      if (options.removeEmbeddings && isEmbeddingKey(key)) {
        result[key] = `[Embedding property - filtered]`;
        continue;
      }

      const sanitized = sanitizeValue(val, options, depth + 1);
      if (sanitized !== undefined) {
        result[key] = sanitized;
      }
    }

    return result;
  }

  // Return unknown types as-is
  return value;
}

/**
 * Sanitize data for LLM consumption
 *
 * Main entry point for sanitization. Cleans data by:
 * - Filtering large lists (> maxListSize elements)
 * - Removing embedding vectors
 * - Removing null/undefined values
 * - Truncating long strings (if configured)
 *
 * @param data - Data to sanitize
 * @param options - Sanitization options
 * @returns Sanitized data
 */
export function sanitize<T = unknown>(
  data: T,
  options: SanitizeOptions = {}
): T {
  const mergedOptions: Required<SanitizeOptions> = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  return sanitizeValue(data, mergedOptions, 0) as T;
}

/**
 * Sanitize Neo4j query results
 *
 * Specialized sanitization for Neo4j query results.
 * Applies standard sanitization plus Neo4j-specific handling.
 *
 * @param rows - Array of result rows
 * @param options - Sanitization options
 * @returns Sanitized rows
 */
export function sanitizeNeo4jResults(
  rows: unknown[],
  options: SanitizeOptions = {}
): unknown[] {
  const mergedOptions: Required<SanitizeOptions> = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  return rows.map(row => {
    if (typeof row === 'object' && row !== null) {
      // Handle Neo4j node/relationship objects
      const obj = row as Record<string, unknown>;

      // If it has identity/labels/properties, it's a Neo4j node
      if ('properties' in obj && typeof obj.properties === 'object') {
        return {
          ...sanitizeValue(obj, mergedOptions, 0) as Record<string, unknown>,
        };
      }
    }

    return sanitizeValue(row, mergedOptions, 0);
  }).filter(row => row !== undefined);
}

/**
 * Estimate the size of data in characters
 *
 * Useful for determining if sanitization is needed.
 *
 * @param data - Data to measure
 * @returns Approximate character count
 */
export function estimateSize(data: unknown): number {
  if (data === null || data === undefined) {
    return 4; // "null"
  }

  if (typeof data === 'string') {
    return data.length + 2; // Include quotes
  }

  if (typeof data === 'number' || typeof data === 'boolean') {
    return String(data).length;
  }

  if (Array.isArray(data)) {
    return data.reduce((sum, item) => sum + estimateSize(item) + 1, 2); // brackets + commas
  }

  if (typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    return Object.entries(obj).reduce(
      (sum, [key, val]) => sum + key.length + estimateSize(val) + 4, // key, quotes, colon, comma
      2 // braces
    );
  }

  return 10; // Unknown type estimate
}

/**
 * Check if data needs sanitization
 *
 * Quick check to determine if sanitization would have any effect.
 *
 * @param data - Data to check
 * @param options - Sanitization options
 * @returns true if sanitization is recommended
 */
export function needsSanitization(
  data: unknown,
  options: SanitizeOptions = {}
): boolean {
  const mergedOptions: Required<SanitizeOptions> = {
    ...DEFAULT_OPTIONS,
    ...options,
  };

  const check = (value: unknown, depth: number = 0): boolean => {
    if (depth > 10) return false;

    if (value === null || value === undefined) {
      return mergedOptions.removeNulls;
    }

    if (typeof value === 'string') {
      return mergedOptions.maxStringLength > 0 && value.length > mergedOptions.maxStringLength;
    }

    if (Array.isArray(value)) {
      if (value.length > mergedOptions.maxListSize) return true;
      if (mergedOptions.removeEmbeddings && isEmbeddingArray(value)) return true;
      return value.some(item => check(item, depth + 1));
    }

    if (typeof value === 'object') {
      const obj = value as Record<string, unknown>;
      for (const [key, val] of Object.entries(obj)) {
        if (mergedOptions.removeEmbeddings && isEmbeddingKey(key)) return true;
        if (check(val, depth + 1)) return true;
      }
    }

    return false;
  };

  return check(data);
}
