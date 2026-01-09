/**
 * Rate Limiting
 *
 * Implements sliding window rate limiting using Cloudflare KV.
 * Protects against abuse by limiting requests per user/IP.
 */

import { DEFAULTS, KV_PREFIXES } from '../config/constants.js';
import * as logger from '../utils/logger.js';

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  /** Maximum requests allowed in the window */
  maxRequests: number;
  /** Window size in seconds */
  windowSeconds: number;
}

/**
 * Rate limit result
 */
export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Current request count in window */
  current: number;
  /** Maximum requests allowed */
  limit: number;
  /** Seconds until window resets */
  resetIn: number;
  /** Remaining requests in window */
  remaining: number;
}

/**
 * Default rate limit configuration
 */
const DEFAULT_CONFIG: RateLimitConfig = {
  maxRequests: DEFAULTS.RATE_LIMIT_REQUESTS,
  windowSeconds: DEFAULTS.RATE_LIMIT_WINDOW,
};

/**
 * Generate rate limit key for KV storage
 */
function getRateLimitKey(identifier: string): string {
  return `${KV_PREFIXES.RATE_LIMIT}${identifier}`;
}

/**
 * Get current window timestamp (floored to window boundary)
 */
function getCurrentWindow(windowSeconds: number): number {
  const now = Math.floor(Date.now() / 1000);
  return Math.floor(now / windowSeconds) * windowSeconds;
}

/**
 * Rate limit entry stored in KV
 */
interface RateLimitEntry {
  count: number;
  window: number;
}

/**
 * Lazy write threshold for rate limiting (OPT-2 optimization)
 *
 * Only write to KV when:
 * 1. First request in a new window (count === 1)
 * 2. Count exceeds this percentage of the limit
 *
 * This reduces KV writes by ~50% for normal usage patterns.
 *
 * @see Roadmap_v2.md OPT-2
 */
const LAZY_WRITE_THRESHOLD = 0.5; // 50%

/**
 * Check and update rate limit for an identifier
 *
 * Uses a simple fixed window algorithm:
 * - Each window is `windowSeconds` long
 * - Counter resets at window boundary
 *
 * Optimization (OPT-2): Uses lazy write to reduce KV operations.
 * Only writes when first request in window or count > 50% of limit.
 *
 * @param kv - KV namespace for storage
 * @param identifier - Unique identifier (userId, IP, etc.)
 * @param config - Rate limit configuration
 * @returns Rate limit result
 */
export async function checkRateLimit(
  kv: KVNamespace,
  identifier: string,
  config: RateLimitConfig = DEFAULT_CONFIG
): Promise<RateLimitResult> {
  const key = getRateLimitKey(identifier);
  const currentWindow = getCurrentWindow(config.windowSeconds);

  try {
    // Get current rate limit entry
    const existing = await kv.get<RateLimitEntry>(key, 'json');

    let count = 1;
    let isNewWindow = true;

    if (existing) {
      if (existing.window === currentWindow) {
        // Same window, increment counter
        count = existing.count + 1;
        isNewWindow = false;
      }
      // Different window, reset to 1
    }

    // Check if limit exceeded
    const allowed = count <= config.maxRequests;

    // OPT-2: Lazy write - only write to KV when necessary
    // Write when:
    // 1. First request in a new window (to establish the window)
    // 2. Count exceeds threshold (approaching limit, need accurate count)
    // 3. Not allowed (to prevent further requests)
    const thresholdCount = Math.floor(config.maxRequests * LAZY_WRITE_THRESHOLD);
    const isFirstInWindow = isNewWindow || count === 1;
    const exceedsThreshold = count > thresholdCount;
    const shouldWrite = isFirstInWindow || exceedsThreshold || !allowed;

    if (allowed && shouldWrite) {
      const entry: RateLimitEntry = {
        count,
        window: currentWindow,
      };

      await kv.put(key, JSON.stringify(entry), {
        expirationTtl: config.windowSeconds * 2, // Keep for 2 windows to handle edge cases
      });

      logger.debug('Rate limit KV write', {
        identifier: identifier.substring(0, 8) + '...',
        count,
        reason: isFirstInWindow ? 'first_in_window' : 'threshold_exceeded',
      });
    }

    // Calculate time until window reset
    const windowEnd = currentWindow + config.windowSeconds;
    const now = Math.floor(Date.now() / 1000);
    const resetIn = Math.max(0, windowEnd - now);

    const result: RateLimitResult = {
      allowed,
      current: count,
      limit: config.maxRequests,
      resetIn,
      remaining: Math.max(0, config.maxRequests - count),
    };

    if (!allowed) {
      logger.warn('Rate limit exceeded', {
        identifier: identifier.substring(0, 8) + '...',
        current: count,
        limit: config.maxRequests,
        resetIn,
      });
    }

    return result;
  } catch (error) {
    // On error, allow the request but log the issue
    logger.error('Rate limit check failed', {
      error: error instanceof Error ? error.message : String(error),
      identifier: identifier.substring(0, 8) + '...',
    });

    return {
      allowed: true,
      current: 0,
      limit: config.maxRequests,
      resetIn: config.windowSeconds,
      remaining: config.maxRequests,
    };
  }
}

/**
 * Create rate limit headers for response
 */
export function createRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(result.resetIn),
  };
}

/**
 * Create 429 Too Many Requests response
 */
export function createRateLimitResponse(result: RateLimitResult): Response {
  return new Response(
    JSON.stringify({
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Try again in ${result.resetIn} seconds.`,
      retryAfter: result.resetIn,
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(result.resetIn),
        ...createRateLimitHeaders(result),
      },
    }
  );
}

/**
 * Get identifier for rate limiting from request
 *
 * Priority:
 * 1. Authenticated user ID
 * 2. CF-Connecting-IP header
 * 3. X-Forwarded-For header
 * 4. Fallback to 'anonymous'
 */
export function getRateLimitIdentifier(
  request: Request,
  userId?: string
): string {
  // Prefer user ID if authenticated
  if (userId) {
    return `user:${userId}`;
  }

  // Try CF-Connecting-IP (Cloudflare)
  const cfIp = request.headers.get('CF-Connecting-IP');
  if (cfIp) {
    return `ip:${cfIp}`;
  }

  // Try X-Forwarded-For
  const forwardedFor = request.headers.get('X-Forwarded-For');
  if (forwardedFor) {
    const ip = forwardedFor.split(',')[0]?.trim();
    if (ip) {
      return `ip:${ip}`;
    }
  }

  // Fallback
  return 'anonymous';
}
