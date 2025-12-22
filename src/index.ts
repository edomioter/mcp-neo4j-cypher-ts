/**
 * MCP Neo4j Cypher Server - Entry Point
 *
 * Cloudflare Workers entry point handling HTTP requests,
 * routing, and CORS.
 */

import type { Env } from './types.js';
import { ROUTES, HTTP_STATUS, CONTENT_TYPES, SERVER_NAME, SERVER_VERSION } from './config/constants.js';
import {
  createCorsPreflightResponse,
  addCorsHeaders,
  parseAllowedOrigins,
} from './utils/cors.js';
import { ParseError, toMcpError, createJsonRpcErrorResponse } from './utils/errors.js';
import * as logger from './utils/logger.js';
import { parseJsonRpcRequest, isNotification, jsonRpcSuccess } from './mcp/protocol.js';
import { routeRequest, type HandlerContext } from './mcp/handlers.js';

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
 * Handle setup UI endpoint
 */
function handleSetupGet(): Response {
  // TODO: Implement full setup UI in Phase 7
  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MCP Neo4j Setup</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 600px;
      margin: 50px auto;
      padding: 20px;
      background: #f5f5f5;
    }
    .container {
      background: white;
      padding: 30px;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    h1 { color: #333; margin-bottom: 10px; }
    p { color: #666; }
    .status {
      padding: 10px;
      background: #e8f5e9;
      border-radius: 4px;
      color: #2e7d32;
    }
  </style>
</head>
<body>
  <div class="container">
    <h1>MCP Neo4j Cypher Server</h1>
    <p>Server is running. Setup UI coming in Phase 7.</p>
    <div class="status">
      <strong>Status:</strong> Operational<br>
      <strong>Version:</strong> ${SERVER_VERSION}
    </div>
  </div>
</body>
</html>
  `.trim();

  return new Response(html, {
    status: HTTP_STATUS.OK,
    headers: { 'Content-Type': CONTENT_TYPES.HTML },
  });
}

/**
 * Handle MCP endpoint (JSON-RPC over HTTP)
 */
async function handleMcpRequest(request: Request, env: Env): Promise<Response> {
  const requestId = generateRequestId();
  const reqLogger = logger.createRequestLogger(requestId);

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

    // Create handler context
    const context: HandlerContext = {
      env,
      requestId,
      readOnly: false, // TODO: Get from user connection in Phase 5
    };

    // Route to appropriate handler
    const result = await routeRequest(rpcRequest, context);

    // Handle different result types
    switch (result.type) {
      case 'notification':
        // Notifications don't get a response
        if (isNotification(rpcRequest)) {
          return new Response(null, { status: HTTP_STATUS.NO_CONTENT });
        }
        // If client sent an id, acknowledge with empty result
        return new Response(
          jsonRpcSuccess(rpcRequest.id, {}),
          {
            status: HTTP_STATUS.OK,
            headers: {
              'Content-Type': CONTENT_TYPES.JSON,
              'X-Request-Id': requestId,
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
          // TODO: Implement setup POST in Phase 7
          response = handleMethodNotAllowed(['GET', 'POST']);
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
