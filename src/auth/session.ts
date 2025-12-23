/**
 * Session Management
 *
 * Handles user sessions using Cloudflare KV for storage.
 * Sessions are token-based with configurable TTL.
 */

import type { SessionData } from '../types.js';
import { KV_PREFIXES, DEFAULTS } from '../config/constants.js';
import { generateUrlSafeToken } from './crypto.js';
import * as logger from '../utils/logger.js';

/**
 * Session creation options
 */
export interface CreateSessionOptions {
  /** Session TTL in seconds (default: 24 hours) */
  ttl?: number;
}

/**
 * Session validation result
 */
export interface SessionValidationResult {
  valid: boolean;
  session?: SessionData;
  error?: string;
}

/**
 * Generate a session key for KV storage
 *
 * @param token - Session token
 * @returns KV key
 */
function getSessionKey(token: string): string {
  return `${KV_PREFIXES.SESSION}${token}`;
}

/**
 * Create a new session
 *
 * Generates a secure token and stores session data in KV.
 *
 * @param kv - KV namespace binding
 * @param userId - User ID
 * @param connectionId - Active connection ID
 * @param options - Session options
 * @returns Session token
 */
export async function createSession(
  kv: KVNamespace,
  userId: string,
  connectionId: string,
  options: CreateSessionOptions = {}
): Promise<string> {
  const ttl = options.ttl ?? DEFAULTS.SESSION_TTL;
  const token = generateUrlSafeToken(32);

  const now = Date.now();
  const sessionData: SessionData = {
    userId,
    connectionId,
    createdAt: now,
    expiresAt: now + (ttl * 1000),
  };

  const key = getSessionKey(token);

  await kv.put(key, JSON.stringify(sessionData), {
    expirationTtl: ttl,
  });

  logger.info('Session created', {
    userId,
    connectionId,
    ttl,
  });

  return token;
}

/**
 * Get session data from token
 *
 * @param kv - KV namespace binding
 * @param token - Session token
 * @returns Session data or null if not found/expired
 */
export async function getSession(
  kv: KVNamespace,
  token: string
): Promise<SessionData | null> {
  if (!token) {
    return null;
  }

  const key = getSessionKey(token);
  const data = await kv.get(key);

  if (!data) {
    return null;
  }

  try {
    const session = JSON.parse(data) as SessionData;

    // Double-check expiration (KV TTL is eventually consistent)
    if (session.expiresAt < Date.now()) {
      // Session expired, clean up
      await kv.delete(key);
      return null;
    }

    return session;
  } catch {
    // Invalid JSON, clean up
    await kv.delete(key);
    return null;
  }
}

/**
 * Validate a session token
 *
 * @param kv - KV namespace binding
 * @param token - Session token to validate
 * @returns Validation result with session data if valid
 */
export async function validateSession(
  kv: KVNamespace,
  token: string
): Promise<SessionValidationResult> {
  if (!token) {
    return { valid: false, error: 'No session token provided' };
  }

  const session = await getSession(kv, token);

  if (!session) {
    return { valid: false, error: 'Invalid or expired session' };
  }

  return { valid: true, session };
}

/**
 * Refresh a session's expiration
 *
 * Extends the session TTL without changing the token.
 *
 * @param kv - KV namespace binding
 * @param token - Session token
 * @param ttl - New TTL in seconds (default: 24 hours)
 * @returns true if session was refreshed, false if not found
 */
export async function refreshSession(
  kv: KVNamespace,
  token: string,
  ttl: number = DEFAULTS.SESSION_TTL
): Promise<boolean> {
  const session = await getSession(kv, token);

  if (!session) {
    return false;
  }

  // Update expiration
  session.expiresAt = Date.now() + (ttl * 1000);

  const key = getSessionKey(token);
  await kv.put(key, JSON.stringify(session), {
    expirationTtl: ttl,
  });

  logger.debug('Session refreshed', { userId: session.userId });

  return true;
}

/**
 * Update session's active connection
 *
 * @param kv - KV namespace binding
 * @param token - Session token
 * @param connectionId - New connection ID
 * @returns true if updated, false if session not found
 */
export async function updateSessionConnection(
  kv: KVNamespace,
  token: string,
  connectionId: string
): Promise<boolean> {
  const session = await getSession(kv, token);

  if (!session) {
    return false;
  }

  session.connectionId = connectionId;

  const key = getSessionKey(token);
  const remainingTtl = Math.max(1, Math.floor((session.expiresAt - Date.now()) / 1000));

  await kv.put(key, JSON.stringify(session), {
    expirationTtl: remainingTtl,
  });

  logger.debug('Session connection updated', {
    userId: session.userId,
    connectionId,
  });

  return true;
}

/**
 * Delete a session (logout)
 *
 * @param kv - KV namespace binding
 * @param token - Session token to delete
 */
export async function deleteSession(
  kv: KVNamespace,
  token: string
): Promise<void> {
  const key = getSessionKey(token);
  await kv.delete(key);

  logger.info('Session deleted');
}

/**
 * Delete all sessions for a user
 *
 * Note: This requires listing all keys with the session prefix,
 * which can be expensive. Use sparingly.
 *
 * @param kv - KV namespace binding
 * @param userId - User ID
 */
export async function deleteUserSessions(
  kv: KVNamespace,
  userId: string
): Promise<number> {
  let deletedCount = 0;
  let cursor: string | undefined;

  do {
    const listResult = await kv.list({
      prefix: KV_PREFIXES.SESSION,
      cursor,
    });

    for (const key of listResult.keys) {
      const data = await kv.get(key.name);
      if (data) {
        try {
          const session = JSON.parse(data) as SessionData;
          if (session.userId === userId) {
            await kv.delete(key.name);
            deletedCount++;
          }
        } catch {
          // Skip invalid entries
        }
      }
    }

    cursor = listResult.list_complete ? undefined : listResult.cursor;
  } while (cursor);

  logger.info('User sessions deleted', { userId, count: deletedCount });

  return deletedCount;
}

/**
 * Extract session token from Authorization header
 *
 * Supports formats:
 * - Bearer <token>
 * - <token> (raw token)
 *
 * @param authHeader - Authorization header value
 * @returns Token or null if not found
 */
export function extractTokenFromHeader(authHeader: string | null): string | null {
  if (!authHeader) {
    return null;
  }

  // Check for Bearer token
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }

  // Assume raw token
  return authHeader.trim();
}

/**
 * Extract session token from request
 *
 * Checks multiple sources in order:
 * 1. Authorization header
 * 2. X-Session-Token header
 * 3. Query parameter: token
 *
 * @param request - HTTP Request
 * @returns Token or null if not found
 */
export function extractTokenFromRequest(request: Request): string | null {
  // Check Authorization header first
  const authHeader = request.headers.get('Authorization');
  const authToken = extractTokenFromHeader(authHeader);
  if (authToken) {
    return authToken;
  }

  // Check X-Session-Token header
  const sessionHeader = request.headers.get('X-Session-Token');
  if (sessionHeader) {
    return sessionHeader.trim();
  }

  // Check query parameter
  const url = new URL(request.url);
  const queryToken = url.searchParams.get('token');
  if (queryToken) {
    return queryToken.trim();
  }

  return null;
}
