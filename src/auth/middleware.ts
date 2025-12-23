/**
 * Authentication Middleware
 *
 * Middleware for validating requests and extracting user context.
 * Handles session validation and connection resolution.
 */

import type { Env, RequestContext } from '../types.js';
import { extractTokenFromRequest, validateSession } from './session.js';
import { getConnectionById } from '../storage/connections.js';
import { AuthenticationError } from '../utils/errors.js';
import * as logger from '../utils/logger.js';

/**
 * Authentication result
 */
export interface AuthResult {
  authenticated: boolean;
  context?: RequestContext;
  error?: string;
}

/**
 * Authenticate a request and build the request context
 *
 * Extracts the session token, validates it, and retrieves
 * the user's Neo4j connection configuration.
 *
 * @param request - HTTP Request
 * @param env - Cloudflare environment bindings
 * @returns Authentication result with context if successful
 */
export async function authenticate(
  request: Request,
  env: Env
): Promise<AuthResult> {
  // Extract token from request
  const token = extractTokenFromRequest(request);

  if (!token) {
    return {
      authenticated: false,
      error: 'No authentication token provided',
    };
  }

  // Validate session
  const sessionResult = await validateSession(env.SESSIONS, token);

  if (!sessionResult.valid || !sessionResult.session) {
    return {
      authenticated: false,
      error: sessionResult.error ?? 'Invalid session',
    };
  }

  const { userId, connectionId } = sessionResult.session;

  // Get user's connection configuration
  const connectionResult = await getConnectionById(
    env.DB,
    connectionId,
    env.ENCRYPTION_KEY
  );

  if (!connectionResult.success || !connectionResult.data) {
    logger.warn('Connection not found for authenticated user', {
      userId,
      connectionId,
    });

    return {
      authenticated: false,
      error: 'Connection configuration not found',
    };
  }

  const { connection, readOnly } = connectionResult.data;

  // Build request context
  const context: RequestContext = {
    userId,
    connectionId,
    connection,
    readOnly,
  };

  logger.debug('Request authenticated', { userId, connectionId });

  return {
    authenticated: true,
    context,
  };
}

/**
 * Require authentication middleware
 *
 * Throws AuthenticationError if request is not authenticated.
 * Use this for endpoints that require authentication.
 *
 * @param request - HTTP Request
 * @param env - Cloudflare environment bindings
 * @returns Request context
 * @throws AuthenticationError if not authenticated
 */
export async function requireAuth(
  request: Request,
  env: Env
): Promise<RequestContext> {
  const result = await authenticate(request, env);

  if (!result.authenticated || !result.context) {
    throw new AuthenticationError(result.error ?? 'Authentication required');
  }

  return result.context;
}

/**
 * Optional authentication middleware
 *
 * Returns context if authenticated, null otherwise.
 * Use this for endpoints that work with or without authentication.
 *
 * @param request - HTTP Request
 * @param env - Cloudflare environment bindings
 * @returns Request context or null
 */
export async function optionalAuth(
  request: Request,
  env: Env
): Promise<RequestContext | null> {
  const result = await authenticate(request, env);

  if (!result.authenticated || !result.context) {
    return null;
  }

  return result.context;
}

/**
 * Check if request has a valid session token
 *
 * Quick check without full context resolution.
 *
 * @param request - HTTP Request
 * @param env - Cloudflare environment bindings
 * @returns true if request has a valid session
 */
export async function hasValidSession(
  request: Request,
  env: Env
): Promise<boolean> {
  const token = extractTokenFromRequest(request);
  if (!token) {
    return false;
  }

  const result = await validateSession(env.SESSIONS, token);
  return result.valid;
}

/**
 * Create an authentication error response
 *
 * @param message - Error message
 * @param headers - Additional headers to include
 * @returns HTTP Response with 401 status
 */
export function createAuthErrorResponse(
  message: string = 'Authentication required',
  headers: Record<string, string> = {}
): Response {
  return new Response(
    JSON.stringify({
      error: 'authentication_required',
      message,
    }),
    {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'WWW-Authenticate': 'Bearer',
        ...headers,
      },
    }
  );
}

/**
 * Validate that a user owns a specific connection
 *
 * @param env - Cloudflare environment bindings
 * @param userId - User ID
 * @param connectionId - Connection ID to validate
 * @returns true if user owns the connection
 */
export async function validateConnectionOwnership(
  env: Env,
  userId: string,
  connectionId: string
): Promise<boolean> {
  const result = await getConnectionById(
    env.DB,
    connectionId,
    env.ENCRYPTION_KEY
  );

  if (!result.success || !result.data) {
    return false;
  }

  // Check if the connection belongs to this user
  // Note: getConnectionById doesn't return userId, so we need to query
  const stmt = env.DB.prepare(
    'SELECT user_id FROM connections WHERE id = ?'
  );
  const row = await stmt.bind(connectionId).first<{ user_id: string }>();

  return row?.user_id === userId;
}
