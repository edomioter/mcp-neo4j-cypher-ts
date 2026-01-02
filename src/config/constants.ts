/**
 * Application Constants
 *
 * Centralized configuration constants for the MCP server.
 */

/**
 * MCP Protocol version
 */
export const MCP_PROTOCOL_VERSION = '2024-11-05';

/**
 * Server identification
 */
export const SERVER_NAME = 'mcp-neo4j-cypher';
export const SERVER_VERSION = '1.0.0';

/**
 * Default configuration values
 */
export const DEFAULTS = {
  /** Default query timeout in seconds */
  READ_TIMEOUT: 30,

  /** Default maximum tokens in response */
  TOKEN_LIMIT: 10000,

  /** Default sample size for schema extraction */
  SCHEMA_SAMPLE_SIZE: 1000,

  /** Session TTL in seconds (10 years - effectively permanent) */
  SESSION_TTL: 315360000,

  /** Schema cache TTL in seconds (5 minutes) */
  SCHEMA_CACHE_TTL: 300,

  /** Rate limit: requests per minute */
  RATE_LIMIT_REQUESTS: 100,

  /** Rate limit window in seconds */
  RATE_LIMIT_WINDOW: 60,

  /** Maximum list size before filtering */
  MAX_LIST_SIZE: 128,

  /** Approximate characters per token for truncation */
  CHARS_PER_TOKEN: 4,
} as const;

/**
 * HTTP Routes
 */
export const ROUTES = {
  /** MCP endpoint (SSE/HTTP) */
  MCP: '/sse',

  /** Alternative MCP endpoint */
  MCP_ALT: '/mcp',

  /** Health check endpoint */
  HEALTH: '/health',

  /** Setup UI endpoint */
  SETUP: '/setup',

  /** API endpoint for setup */
  API_SETUP: '/api/setup',

  /** Token management endpoints */
  TOKENS: '/api/tokens',
  REVOKE_TOKEN: '/api/tokens/revoke',
} as const;

/**
 * MCP Methods
 */
export const MCP_METHODS = {
  INITIALIZE: 'initialize',
  INITIALIZED: 'notifications/initialized',
  TOOLS_LIST: 'tools/list',
  TOOLS_CALL: 'tools/call',
  PING: 'ping',
} as const;

/**
 * Tool names
 */
export const TOOL_NAMES = {
  GET_SCHEMA: 'get_neo4j_schema',
  READ_CYPHER: 'read_neo4j_cypher',
  WRITE_CYPHER: 'write_neo4j_cypher',
} as const;

/**
 * KV key prefixes
 */
export const KV_PREFIXES = {
  SESSION: 'session:',
  SCHEMA_CACHE: 'schema:',
  RATE_LIMIT: 'rate:',
} as const;

/**
 * HTTP Status codes used in the application
 */
export const HTTP_STATUS = {
  OK: 200,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_ERROR: 500,
} as const;

/**
 * Content types
 */
export const CONTENT_TYPES = {
  JSON: 'application/json',
  HTML: 'text/html; charset=utf-8',
  TEXT: 'text/plain',
  SSE: 'text/event-stream',
} as const;
