/**
 * Cache Storage
 *
 * Caching utilities using Cloudflare KV.
 * Primarily used for caching Neo4j schema to reduce API calls.
 */

import type { ProcessedSchema } from '../neo4j/types.js';
import { KV_PREFIXES, DEFAULTS } from '../config/constants.js';
import * as logger from '../utils/logger.js';

/**
 * Cached schema with metadata
 */
export interface CachedSchema {
  schema: ProcessedSchema;
  cachedAt: number;
  expiresAt: number;
}

/**
 * Cache options
 */
export interface CacheOptions {
  /** TTL in seconds */
  ttl?: number;
}

/**
 * Generate a schema cache key
 *
 * @param connectionId - Connection ID
 * @returns Cache key
 */
function getSchemaKey(connectionId: string): string {
  return `${KV_PREFIXES.SCHEMA_CACHE}${connectionId}`;
}

/**
 * Get cached schema for a connection
 *
 * @param kv - KV namespace binding
 * @param connectionId - Connection ID
 * @returns Cached schema or null if not found/expired
 */
export async function getCachedSchema(
  kv: KVNamespace,
  connectionId: string
): Promise<ProcessedSchema | null> {
  const key = getSchemaKey(connectionId);

  try {
    const data = await kv.get(key);

    if (!data) {
      return null;
    }

    const cached = JSON.parse(data) as CachedSchema;

    // Double-check expiration (KV TTL is eventually consistent)
    if (cached.expiresAt < Date.now()) {
      // Cache expired, clean up
      await kv.delete(key);
      return null;
    }

    logger.debug('Schema cache hit', { connectionId });

    return cached.schema;
  } catch (error) {
    logger.warn('Failed to read schema cache', {
      connectionId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Cache a schema for a connection
 *
 * @param kv - KV namespace binding
 * @param connectionId - Connection ID
 * @param schema - Schema to cache
 * @param options - Cache options
 */
export async function cacheSchema(
  kv: KVNamespace,
  connectionId: string,
  schema: ProcessedSchema,
  options: CacheOptions = {}
): Promise<void> {
  const ttl = options.ttl ?? DEFAULTS.SCHEMA_CACHE_TTL;
  const key = getSchemaKey(connectionId);

  const now = Date.now();
  const cached: CachedSchema = {
    schema,
    cachedAt: now,
    expiresAt: now + (ttl * 1000),
  };

  try {
    await kv.put(key, JSON.stringify(cached), {
      expirationTtl: ttl,
    });

    logger.debug('Schema cached', { connectionId, ttl });
  } catch (error) {
    logger.warn('Failed to cache schema', {
      connectionId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Invalidate cached schema for a connection
 *
 * Call this when a connection's credentials change or
 * when you want to force a fresh schema fetch.
 *
 * @param kv - KV namespace binding
 * @param connectionId - Connection ID
 */
export async function invalidateSchemaCache(
  kv: KVNamespace,
  connectionId: string
): Promise<void> {
  const key = getSchemaKey(connectionId);

  try {
    await kv.delete(key);
    logger.debug('Schema cache invalidated', { connectionId });
  } catch (error) {
    logger.warn('Failed to invalidate schema cache', {
      connectionId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Get schema from cache or fetch using provided function
 *
 * Convenience function that handles cache logic.
 *
 * @param kv - KV namespace binding
 * @param connectionId - Connection ID
 * @param fetchFn - Function to fetch schema if not cached
 * @param options - Cache options
 * @returns Schema (from cache or freshly fetched)
 */
export async function getOrFetchSchema(
  kv: KVNamespace,
  connectionId: string,
  fetchFn: () => Promise<ProcessedSchema>,
  options: CacheOptions = {}
): Promise<ProcessedSchema> {
  // Try cache first
  const cached = await getCachedSchema(kv, connectionId);

  if (cached) {
    return cached;
  }

  // Fetch fresh schema
  const schema = await fetchFn();

  // Cache it
  await cacheSchema(kv, connectionId, schema, options);

  return schema;
}

// ============================================
// Generic Cache Functions
// ============================================

/**
 * Get a cached value
 *
 * @param kv - KV namespace binding
 * @param key - Cache key
 * @returns Cached value or null
 */
export async function getCached<T>(
  kv: KVNamespace,
  key: string
): Promise<T | null> {
  try {
    const data = await kv.get(key);

    if (!data) {
      return null;
    }

    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

/**
 * Set a cached value
 *
 * @param kv - KV namespace binding
 * @param key - Cache key
 * @param value - Value to cache
 * @param ttl - TTL in seconds
 */
export async function setCached<T>(
  kv: KVNamespace,
  key: string,
  value: T,
  ttl: number
): Promise<void> {
  try {
    await kv.put(key, JSON.stringify(value), {
      expirationTtl: ttl,
    });
  } catch (error) {
    logger.warn('Failed to set cache', {
      key,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Delete a cached value
 *
 * @param kv - KV namespace binding
 * @param key - Cache key
 */
export async function deleteCached(
  kv: KVNamespace,
  key: string
): Promise<void> {
  try {
    await kv.delete(key);
  } catch {
    // Ignore errors
  }
}

/**
 * Get or set cached value
 *
 * @param kv - KV namespace binding
 * @param key - Cache key
 * @param fetchFn - Function to fetch value if not cached
 * @param ttl - TTL in seconds
 * @returns Cached or fetched value
 */
export async function getOrSet<T>(
  kv: KVNamespace,
  key: string,
  fetchFn: () => Promise<T>,
  ttl: number
): Promise<T> {
  const cached = await getCached<T>(kv, key);

  if (cached !== null) {
    return cached;
  }

  const value = await fetchFn();
  await setCached(kv, key, value, ttl);

  return value;
}
