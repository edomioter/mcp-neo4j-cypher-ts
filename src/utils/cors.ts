/**
 * CORS Utilities
 *
 * Handles Cross-Origin Resource Sharing headers for secure
 * communication between Claude.ai and the MCP server.
 */

/**
 * Default allowed origins for MCP requests
 */
const DEFAULT_ALLOWED_ORIGINS = [
  'https://claude.ai',
  'https://www.claude.ai',
];

/**
 * Parse allowed origins from environment variable
 */
export function parseAllowedOrigins(originsString: string | undefined): string[] {
  if (!originsString) {
    return DEFAULT_ALLOWED_ORIGINS;
  }

  return originsString
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

/**
 * Check if origin is allowed
 */
export function isOriginAllowed(origin: string | null, allowedOrigins: string[]): boolean {
  if (!origin) {
    return false;
  }

  return allowedOrigins.includes(origin);
}

/**
 * Get CORS headers for a request
 */
export function getCorsHeaders(
  requestOrigin: string | null,
  allowedOrigins: string[]
): Record<string, string> {
  // Determine which origin to allow
  const corsOrigin =
    requestOrigin && isOriginAllowed(requestOrigin, allowedOrigins)
      ? requestOrigin
      : allowedOrigins[0] ?? 'https://claude.ai';

  return {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Session-Token',
    'Access-Control-Max-Age': '86400',
    'Access-Control-Expose-Headers': 'X-Request-Id, X-Rate-Limit-Remaining',
  };
}

/**
 * Create a CORS preflight response
 */
export function createCorsPreflightResponse(
  requestOrigin: string | null,
  allowedOrigins: string[]
): Response {
  return new Response(null, {
    status: 204,
    headers: getCorsHeaders(requestOrigin, allowedOrigins),
  });
}

/**
 * Add CORS headers to an existing response
 */
export function addCorsHeaders(
  response: Response,
  requestOrigin: string | null,
  allowedOrigins: string[]
): Response {
  const corsHeaders = getCorsHeaders(requestOrigin, allowedOrigins);
  const newHeaders = new Headers(response.headers);

  for (const [key, value] of Object.entries(corsHeaders)) {
    newHeaders.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
}
