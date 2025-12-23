/**
 * MCP Neo4j Cypher Server - Entry Point
 *
 * Cloudflare Workers entry point handling HTTP requests,
 * routing, and CORS.
 */

import type { Env } from './types.js';
import { ROUTES, HTTP_STATUS, CONTENT_TYPES, SERVER_NAME, SERVER_VERSION, MCP_METHODS } from './config/constants.js';
import {
  createCorsPreflightResponse,
  addCorsHeaders,
  parseAllowedOrigins,
} from './utils/cors.js';
import { ParseError, toMcpError, createJsonRpcErrorResponse } from './utils/errors.js';
import * as logger from './utils/logger.js';
import { parseJsonRpcRequest, isNotification, jsonRpcSuccess } from './mcp/protocol.js';
import { routeRequest, type HandlerContext } from './mcp/handlers.js';

// Authentication and storage imports
import { optionalAuth } from './auth/middleware.js';
import { createNeo4jClient } from './neo4j/client.js';

// Setup UI and API imports
import { generateSetupPageHtml } from './config/ui.js';
import { handleSetupPost, handleConnectionStatus } from './api/setup.js';

// Security imports
import {
  checkRateLimit,
  getRateLimitIdentifier,
  createRateLimitHeaders,
  createRateLimitResponse,
} from './security/ratelimit.js';
import * as audit from './security/audit.js';

/**
 * Generate a unique request ID
 */
function generateRequestId(): string {
  return crypto.randomUUID();
}

/**
 * Parse server configuration from environment
 */
function getServerConfig(env: Env) {
  return {
    readTimeout: parseInt(env.DEFAULT_READ_TIMEOUT, 10) || 30,
    tokenLimit: parseInt(env.DEFAULT_TOKEN_LIMIT, 10) || 10000,
    schemaSampleSize: parseInt(env.DEFAULT_SCHEMA_SAMPLE, 10) || 1000,
    allowedOrigins: parseAllowedOrigins(env.ALLOWED_ORIGINS),
    environment: env.ENVIRONMENT as 'development' | 'staging' | 'production',
  };
}

/**
 * Handle health check endpoint
 */
function handleHealthCheck(): Response {
  return new Response(
    JSON.stringify({
      status: 'ok',
      server: SERVER_NAME,
      version: SERVER_VERSION,
      timestamp: new Date().toISOString(),
    }),
    {
      status: HTTP_STATUS.OK,
      headers: { 'Content-Type': CONTENT_TYPES.JSON },
    }
  );
}

/**
 * Handle setup UI endpoint (GET)
 */
function handleSetupGet(): Response {
  const html = generateSetupPageHtml();

  return new Response(html, {
    status: HTTP_STATUS.OK,
    headers: { 'Content-Type': CONTENT_TYPES.HTML },
  });
}

/**
 * Check if method requires authentication
 *
 * Some MCP methods (like initialize, tools/list) work without auth,
 * but tools/call requires authentication to access Neo4j.
 */
function methodRequiresAuth(method: string): boolean {
  // These methods work without authentication
  const publicMethods: string[] = [
    MCP_METHODS.INITIALIZE,
    MCP_METHODS.INITIALIZED,
    MCP_METHODS.TOOLS_LIST,
    MCP_METHODS.PING,
  ];

  return !publicMethods.includes(method);
}

/**
 * Handle MCP endpoint (JSON-RPC over HTTP)
 */
async function handleMcpRequest(request: Request, env: Env): Promise<Response> {
  const requestId = generateRequestId();
  const reqLogger = logger.createRequestLogger(requestId);
  const config = getServerConfig(env);

  try {
    // Parse JSON body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ParseError('Invalid JSON in request body');
    }

    // Parse and validate JSON-RPC request
    const rpcRequest = parseJsonRpcRequest(body);

    reqLogger.info('MCP request received', { method: rpcRequest.method, id: rpcRequest.id });

    // Try to authenticate (optional for some methods)
    const authContext = await optionalAuth(request, env);

    // Rate limiting
    const rateLimitId = getRateLimitIdentifier(request, authContext?.userId);
    const rateLimitResult = await checkRateLimit(env.SESSIONS, rateLimitId);

    if (!rateLimitResult.allowed) {
      audit.logRateLimitExceeded(request, rateLimitId, rateLimitResult.current, rateLimitResult.limit, requestId);
      return createRateLimitResponse(rateLimitResult);
    }

    // Check if authentication is required for this method
    const requiresAuth = methodRequiresAuth(rpcRequest.method);

    // Create handler context
    const context: HandlerContext = {
      env,
      requestId,
      readOnly: authContext?.readOnly ?? false,
      timeout: config.readTimeout,
      tokenLimit: config.tokenLimit,
      schemaSampleSize: config.schemaSampleSize,
    };

    // If authenticated, create Neo4j client
    if (authContext) {
      context.neo4jClient = createNeo4jClient(authContext.connection, {
        defaultTimeout: config.readTimeout,
        tokenLimit: config.tokenLimit,
        schemaSampleSize: config.schemaSampleSize,
      });
      context.connectionId = authContext.connectionId;
      context.userId = authContext.userId;
      context.readOnly = authContext.readOnly;

      reqLogger.debug('Request authenticated', {
        userId: authContext.userId,
        connectionId: authContext.connectionId,
      });

      // Audit log successful authentication
      audit.logAuthSuccess(request, authContext.userId, requestId);
    } else if (requiresAuth) {
      // Method requires auth but user is not authenticated
      reqLogger.warn('Authentication required but not provided', { method: rpcRequest.method });
      audit.logAuthFailure(request, 'No credentials provided', requestId);
      // We still proceed - the handler will return an appropriate error
    }

    // Route to appropriate handler
    const result = await routeRequest(rpcRequest, context);

    // Handle different result types
    switch (result.type) {
      case 'notification':
        // Notifications don't get a response
        if (isNotification(rpcRequest)) {
          return new Response(null, {
            status: HTTP_STATUS.NO_CONTENT,
            headers: createRateLimitHeaders(rateLimitResult),
          });
        }
        // If client sent an id, acknowledge with empty result
        return new Response(
          jsonRpcSuccess(rpcRequest.id, {}),
          {
            status: HTTP_STATUS.OK,
            headers: {
              'Content-Type': CONTENT_TYPES.JSON,
              'X-Request-Id': requestId,
              ...createRateLimitHeaders(rateLimitResult),
            },
          }
        );

      case 'response':
        return new Response(
          jsonRpcSuccess(rpcRequest.id, result.result),
          {
            status: HTTP_STATUS.OK,
            headers: {
              'Content-Type': CONTENT_TYPES.JSON,
              'X-Request-Id': requestId,
              ...createRateLimitHeaders(rateLimitResult),
            },
          }
        );

      case 'error':
        throw result.error;
    }
  } catch (err) {
    const mcpError = toMcpError(err);
    reqLogger.error('MCP request failed', { error: mcpError.message, code: mcpError.code });

    return new Response(createJsonRpcErrorResponse(null, mcpError), {
      status: HTTP_STATUS.OK, // JSON-RPC errors still return 200
      headers: {
        'Content-Type': CONTENT_TYPES.JSON,
        'X-Request-Id': requestId,
      },
    });
  }
}

/**
 * Handle 404 Not Found
 */
function handleNotFound(): Response {
  return new Response(
    JSON.stringify({
      error: 'Not Found',
      message: 'The requested endpoint does not exist',
    }),
    {
      status: HTTP_STATUS.NOT_FOUND,
      headers: { 'Content-Type': CONTENT_TYPES.JSON },
    }
  );
}

/**
 * Handle 405 Method Not Allowed
 */
function handleMethodNotAllowed(allowed: string[]): Response {
  return new Response(
    JSON.stringify({
      error: 'Method Not Allowed',
      allowed,
    }),
    {
      status: HTTP_STATUS.METHOD_NOT_ALLOWED,
      headers: {
        'Content-Type': CONTENT_TYPES.JSON,
        Allow: allowed.join(', '),
      },
    }
  );
}

/**
 * Main request handler
 */
async function handleRequest(request: Request, env: Env): Promise<Response> {
  const startTime = Date.now();
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  const config = getServerConfig(env);

  // Set log level based on environment
  if (config.environment === 'development') {
    logger.setLogLevel('debug');
  }

  logger.logRequest(request);

  // Handle CORS preflight
  const origin = request.headers.get('Origin');
  if (method === 'OPTIONS') {
    return createCorsPreflightResponse(origin, config.allowedOrigins);
  }

  let response: Response;

  try {
    // Route handling
    switch (path) {
      case ROUTES.HEALTH:
        if (method !== 'GET') {
          response = handleMethodNotAllowed(['GET']);
        } else {
          response = handleHealthCheck();
        }
        break;

      case ROUTES.SETUP:
        if (method === 'GET') {
          response = handleSetupGet();
        } else if (method === 'POST') {
          response = await handleSetupPost(request, env);
        } else {
          response = handleMethodNotAllowed(['GET', 'POST']);
        }
        break;

      case ROUTES.API_SETUP:
        if (method === 'POST') {
          response = await handleSetupPost(request, env);
        } else if (method === 'GET') {
          response = await handleConnectionStatus(request, env);
        } else {
          response = handleMethodNotAllowed(['GET', 'POST']);
        }
        break;

      case ROUTES.MCP:
      case ROUTES.MCP_ALT:
        if (method !== 'POST') {
          response = handleMethodNotAllowed(['POST']);
        } else {
          response = await handleMcpRequest(request, env);
        }
        break;

      default:
        response = handleNotFound();
    }
  } catch (err) {
    logger.logError(err instanceof Error ? err : new Error(String(err)));
    response = new Response(
      JSON.stringify({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred',
      }),
      {
        status: HTTP_STATUS.INTERNAL_ERROR,
        headers: { 'Content-Type': CONTENT_TYPES.JSON },
      }
    );
  }

  // Add CORS headers to response
  response = addCorsHeaders(response, origin, config.allowedOrigins);

  // Log response
  logger.logResponse(request, response, startTime);

  return response;
}

/**
 * Cloudflare Workers export
 */
export default {
  async fetch(request: Request, env: Env, _ctx: ExecutionContext): Promise<Response> {
    return handleRequest(request, env);
  },
};
