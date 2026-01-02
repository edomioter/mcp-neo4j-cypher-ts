/**
 * Token Management API
 *
 * Endpoints for listing and revoking session tokens.
 */

import type { Env } from '../types.js';
import { HTTP_STATUS, CONTENT_TYPES, KV_PREFIXES } from '../config/constants.js';
import { requireAuth } from '../auth/middleware.js';
import { deleteSession } from '../auth/session.js';
import * as logger from '../utils/logger.js';
import * as audit from '../security/audit.js';

/**
 * Token info for listing
 */
interface TokenInfo {
  token: string;
  userId: string;
  connectionId: string;
  createdAt: number;
  expiresAt: number;
  current: boolean;
}

/**
 * List all active tokens for the authenticated user
 *
 * GET /api/tokens
 * Authorization: Bearer <token>
 */
export async function handleListTokens(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    // Authenticate the request
    const authContext = await requireAuth(request, env);
    const currentToken = extractCurrentToken(request);

    // List all session keys from KV
    const tokens: TokenInfo[] = [];
    let cursor: string | undefined;

    do {
      const listResult = await env.SESSIONS.list({
        prefix: KV_PREFIXES.SESSION,
        cursor,
      });

      for (const key of listResult.keys) {
        const tokenValue = key.name.replace(KV_PREFIXES.SESSION, '');
        const data = await env.SESSIONS.get(key.name);

        if (data) {
          try {
            const session = JSON.parse(data);

            // Only include tokens for this user
            if (session.userId === authContext.userId) {
              tokens.push({
                token: tokenValue,
                userId: session.userId,
                connectionId: session.connectionId,
                createdAt: session.createdAt,
                expiresAt: session.expiresAt,
                current: tokenValue === currentToken,
              });
            }
          } catch {
            // Skip invalid entries
          }
        }
      }

      cursor = listResult.list_complete ? undefined : listResult.cursor;
    } while (cursor);

    // Sort by creation date (newest first)
    tokens.sort((a, b) => b.createdAt - a.createdAt);

    logger.info('Listed tokens for user', {
      userId: authContext.userId,
      tokenCount: tokens.length,
    });

    // Audit log: Token list accessed
    audit.logTokenListAccessed(
      request,
      authContext.userId,
      tokens.length
    );

    return new Response(
      JSON.stringify({
        success: true,
        tokens: tokens.map(t => ({
          token: maskToken(t.token),
          fullToken: t.current ? t.token : undefined, // Only show full token for current
          connectionId: t.connectionId,
          createdAt: new Date(t.createdAt).toISOString(),
          expiresAt: new Date(t.expiresAt).toISOString(),
          current: t.current,
        })),
        total: tokens.length,
      }),
      {
        status: HTTP_STATUS.OK,
        headers: { 'Content-Type': CONTENT_TYPES.JSON },
      }
    );
  } catch (error) {
    logger.error('Failed to list tokens', {
      error: error instanceof Error ? error.message : String(error),
    });

    return new Response(
      JSON.stringify({
        success: false,
        message: 'Failed to list tokens',
      }),
      {
        status: HTTP_STATUS.INTERNAL_ERROR,
        headers: { 'Content-Type': CONTENT_TYPES.JSON },
      }
    );
  }
}

/**
 * Revoke a token
 *
 * POST /api/tokens/revoke
 * Body: { "token": "token_to_revoke" }
 * Authorization: Bearer <current_token>
 */
export async function handleRevokeToken(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    // Authenticate the request
    const authContext = await requireAuth(request, env);
    const currentToken = extractCurrentToken(request);

    // Parse request body
    let body: { token?: string };
    try {
      body = await request.json();
    } catch {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Invalid JSON in request body',
        }),
        {
          status: HTTP_STATUS.BAD_REQUEST,
          headers: { 'Content-Type': CONTENT_TYPES.JSON },
        }
      );
    }

    const tokenToRevoke = body.token;

    if (!tokenToRevoke) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Token is required',
        }),
        {
          status: HTTP_STATUS.BAD_REQUEST,
          headers: { 'Content-Type': CONTENT_TYPES.JSON },
        }
      );
    }

    // Prevent revoking the current token
    if (tokenToRevoke === currentToken) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Cannot revoke the current token. Use a different token to revoke this one.',
        }),
        {
          status: HTTP_STATUS.BAD_REQUEST,
          headers: { 'Content-Type': CONTENT_TYPES.JSON },
        }
      );
    }

    // Verify the token belongs to this user
    const sessionKey = `${KV_PREFIXES.SESSION}${tokenToRevoke}`;
    const sessionData = await env.SESSIONS.get(sessionKey);

    if (!sessionData) {
      return new Response(
        JSON.stringify({
          success: false,
          message: 'Token not found or already revoked',
        }),
        {
          status: HTTP_STATUS.NOT_FOUND,
          headers: { 'Content-Type': CONTENT_TYPES.JSON },
        }
      );
    }

    const session = JSON.parse(sessionData);

    // Ensure the token belongs to the authenticated user
    if (session.userId !== authContext.userId) {
      logger.warn('Attempted to revoke token belonging to another user', {
        userId: authContext.userId,
        tokenOwnerId: session.userId,
      });

      // Audit log: Unauthorized revocation attempt
      audit.logTokenRevokeAttemptFailed(
        request,
        authContext.userId,
        'Attempted to revoke token belonging to another user'
      );

      return new Response(
        JSON.stringify({
          success: false,
          message: 'Unauthorized to revoke this token',
        }),
        {
          status: HTTP_STATUS.FORBIDDEN,
          headers: { 'Content-Type': CONTENT_TYPES.JSON },
        }
      );
    }

    // Revoke the token
    await deleteSession(env.SESSIONS, tokenToRevoke);

    logger.info('Token revoked', {
      userId: authContext.userId,
      revokedToken: maskToken(tokenToRevoke),
    });

    // Audit log: Token revoked successfully
    audit.logTokenRevoked(
      request,
      authContext.userId,
      maskToken(tokenToRevoke)
    );

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Token revoked successfully',
      }),
      {
        status: HTTP_STATUS.OK,
        headers: { 'Content-Type': CONTENT_TYPES.JSON },
      }
    );
  } catch (error) {
    logger.error('Failed to revoke token', {
      error: error instanceof Error ? error.message : String(error),
    });

    return new Response(
      JSON.stringify({
        success: false,
        message: 'Failed to revoke token',
      }),
      {
        status: HTTP_STATUS.INTERNAL_ERROR,
        headers: { 'Content-Type': CONTENT_TYPES.JSON },
      }
    );
  }
}

/**
 * Extract current token from request
 */
function extractCurrentToken(request: Request): string | null {
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }

  const url = new URL(request.url);
  return url.searchParams.get('token');
}

/**
 * Mask a token for display (show first 8 and last 4 characters)
 */
function maskToken(token: string): string {
  if (token.length <= 12) {
    return token.slice(0, 4) + '***';
  }
  return token.slice(0, 8) + '...' + token.slice(-4);
}
