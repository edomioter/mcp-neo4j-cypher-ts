/**
 * MCP Handlers
 *
 * Implements the core MCP protocol handlers:
 * - initialize: Server capability negotiation
 * - notifications/initialized: Client ready signal
 * - tools/list: List available tools
 * - tools/call: Execute a tool
 */

import type {
  Env,
  JsonRpcRequest,
  McpInitializeResult,
  McpToolsListResult,
  McpToolResult,
  McpToolResultContent,
} from '../types.js';
import {
  MCP_PROTOCOL_VERSION,
  SERVER_NAME,
  SERVER_VERSION,
  MCP_METHODS,
  TOOL_NAMES,
  DEFAULTS,
} from '../config/constants.js';
import { MethodNotFoundError, InvalidParamsError, ValidationError } from '../utils/errors.js';
import { validateToolCallParams, getOptionalNumberParam, getOptionalObjectParam } from './protocol.js';
import { getAllTools, toolExists } from './tools.js';
import * as logger from '../utils/logger.js';

// Neo4j imports
import type { Neo4jClient } from '../neo4j/client.js';
import type { ProcessedSchema } from '../neo4j/types.js';
import { extractSchema, formatSchemaForLLM } from '../neo4j/schema.js';
import { executeReadQuery, executeWriteQuery, isWriteQuery, validateCypherSyntax } from '../neo4j/queries.js';

// Sanitization and token imports
import { sanitize, sanitizeNeo4jResults } from '../utils/sanitize.js';
import { truncateToTokens } from '../utils/tokens.js';

// Cache imports
import { getCachedSchema, cacheSchema } from '../storage/cache.js';

// Security imports
import { validateQuery, sanitizeParameters } from '../security/query-validator.js';

/**
 * Context passed to handlers
 */
export interface HandlerContext {
  env: Env;
  requestId: string;
  /** Neo4j client (optional - null if not connected) */
  neo4jClient?: Neo4jClient;
  /** Whether the connection is read-only */
  readOnly?: boolean;
  /** Query timeout in seconds */
  timeout?: number;
  /** Token limit for responses */
  tokenLimit?: number;
  /** Sample size for schema extraction */
  schemaSampleSize?: number;
  /** User ID (if authenticated) */
  userId?: string;
  /** Connection ID (if authenticated) */
  connectionId?: string;
}

/**
 * Handler result type
 */
export type HandlerResult =
  | { type: 'response'; result: unknown }
  | { type: 'notification' }
  | { type: 'error'; error: Error };

/**
 * Handle initialize request
 *
 * This is the first message from the client to negotiate capabilities.
 */
export function handleInitialize(
  _request: JsonRpcRequest,
  _context: HandlerContext
): McpInitializeResult {
  logger.info('MCP Initialize', { protocolVersion: MCP_PROTOCOL_VERSION });

  return {
    protocolVersion: MCP_PROTOCOL_VERSION,
    serverInfo: {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    capabilities: {
      tools: {},
    },
  };
}

/**
 * Handle notifications/initialized
 *
 * Client signals it has processed the initialize response.
 * This is a notification, no response is expected.
 */
export function handleInitialized(
  _request: JsonRpcRequest,
  _context: HandlerContext
): void {
  logger.info('MCP Initialized notification received');
  // Nothing to do, just acknowledge
}

/**
 * Handle tools/list request
 *
 * Returns the list of available tools.
 */
export function handleToolsList(
  _request: JsonRpcRequest,
  context: HandlerContext
): McpToolsListResult {
  const includeWriteTool = !context.readOnly;
  const tools = getAllTools(includeWriteTool);

  logger.info('MCP Tools List', { toolCount: tools.length, readOnly: context.readOnly });

  return {
    tools,
  };
}

/**
 * Handle tools/call request
 *
 * Executes a tool and returns the result.
 */
export async function handleToolsCall(
  request: JsonRpcRequest,
  context: HandlerContext
): Promise<McpToolResult> {
  // Validate and extract tool call params
  const { name, arguments: args } = validateToolCallParams(request.params);

  logger.info('MCP Tool Call', { tool: name, requestId: context.requestId });

  // Check if tool exists
  if (!toolExists(name)) {
    throw new InvalidParamsError(`Unknown tool: ${name}`);
  }

  // Execute the appropriate tool
  switch (name) {
    case TOOL_NAMES.GET_SCHEMA:
      return executeGetSchema(args, context);

    case TOOL_NAMES.READ_CYPHER:
      return executeReadCypher(args, context);

    case TOOL_NAMES.WRITE_CYPHER:
      return executeWriteCypher(args, context);

    default:
      throw new InvalidParamsError(`Unknown tool: ${name}`);
  }
}

/**
 * Execute get_neo4j_schema tool
 */
async function executeGetSchema(
  args: Record<string, unknown> | undefined,
  context: HandlerContext
): Promise<McpToolResult> {
  const sampleSize = getOptionalNumberParam(
    args,
    'sample_size',
    context.schemaSampleSize ?? DEFAULTS.SCHEMA_SAMPLE_SIZE
  );

  logger.info('Executing get_neo4j_schema', { sampleSize, requestId: context.requestId });

  // Check if Neo4j client is available
  if (!context.neo4jClient) {
    return createToolResult(
      JSON.stringify({
        error: 'No Neo4j connection configured',
        message: 'Please configure your Neo4j connection via the setup endpoint first.',
        setupUrl: '/setup',
      }, null, 2),
      true
    );
  }

  try {
    let schema: ProcessedSchema | null = null;

    // Try to get schema from cache first (if we have a connectionId)
    if (context.connectionId) {
      const cachedSchema = await getCachedSchema(context.env.SESSIONS, context.connectionId);
      if (cachedSchema) {
        logger.debug('Using cached schema', { connectionId: context.connectionId, requestId: context.requestId });
        schema = cachedSchema;
      }
    }

    // If not cached, extract from Neo4j
    if (!schema) {
      schema = await extractSchema(context.neo4jClient, sampleSize);

      // Cache the schema for future requests
      if (context.connectionId) {
        await cacheSchema(context.env.SESSIONS, context.connectionId, schema);
        logger.debug('Schema cached', { connectionId: context.connectionId, requestId: context.requestId });
      }
    }

    // Sanitize the schema (remove any large/irrelevant data)
    const sanitizedSchema = sanitize(schema) as ProcessedSchema;

    // Format for LLM consumption
    const formattedSchema = formatSchemaForLLM(sanitizedSchema);

    // Apply token limit truncation if configured
    const tokenLimit = context.tokenLimit ?? DEFAULTS.TOKEN_LIMIT;
    const tokenResult = truncateToTokens(formattedSchema, { maxTokens: tokenLimit });

    if (tokenResult.truncated) {
      logger.info('Schema response truncated due to token limit', {
        originalTokens: tokenResult.originalTokens,
        finalTokens: tokenResult.finalTokens,
        tokenLimit,
        requestId: context.requestId,
      });
    }

    return createToolResult(tokenResult.text);
  } catch (error) {
    logger.error('Schema extraction failed', {
      error: error instanceof Error ? error.message : String(error),
      requestId: context.requestId,
    });

    return createToolResult(
      JSON.stringify({
        error: 'Schema extraction failed',
        message: error instanceof Error ? error.message : String(error),
      }, null, 2),
      true
    );
  }
}

/**
 * Execute read_neo4j_cypher tool
 */
async function executeReadCypher(
  args: Record<string, unknown> | undefined,
  context: HandlerContext
): Promise<McpToolResult> {
  if (!args || typeof args.query !== 'string') {
    throw new InvalidParamsError('Missing required parameter: query');
  }

  const query = args.query;
  const rawParams = getOptionalObjectParam(args, 'params');

  logger.info('Executing read_neo4j_cypher', {
    queryLength: query.length,
    hasParams: !!rawParams,
    requestId: context.requestId,
  });

  // Security validation
  const securityCheck = validateQuery(query);
  if (!securityCheck.valid) {
    logger.warn('Query blocked by security validation', {
      error: securityCheck.error,
      requestId: context.requestId,
    });
    throw new ValidationError(securityCheck.error ?? 'Query blocked for security reasons');
  }

  // Log warnings if any
  if (securityCheck.warnings.length > 0) {
    logger.info('Query warnings', { warnings: securityCheck.warnings, requestId: context.requestId });
  }

  // Sanitize parameters
  const params = sanitizeParameters(rawParams);

  // Validate query syntax
  const syntaxCheck = validateCypherSyntax(query);
  if (!syntaxCheck.valid) {
    throw new ValidationError(syntaxCheck.error ?? 'Invalid query syntax');
  }

  // Validate it's a read query
  if (isWriteQuery(query)) {
    throw new ValidationError(
      'This query contains write operations. Use write_neo4j_cypher for CREATE, MERGE, DELETE, SET, or REMOVE operations.'
    );
  }

  // Check if Neo4j client is available
  if (!context.neo4jClient) {
    return createToolResult(
      JSON.stringify({
        error: 'No Neo4j connection configured',
        message: 'Please configure your Neo4j connection via the setup endpoint first.',
        query: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
      }, null, 2),
      true
    );
  }

  try {
    // Execute read query
    const result = await executeReadQuery(
      context.neo4jClient,
      query,
      params,
      { timeout: context.timeout ?? DEFAULTS.READ_TIMEOUT }
    );

    // Sanitize the results (filter embeddings, large lists, etc.)
    const sanitizedRows = sanitizeNeo4jResults(result.rows);

    // Format result
    const output = {
      columns: result.columns,
      rowCount: result.rowCount,
      rows: sanitizedRows,
      ...(result.truncated && { truncated: true }),
    };

    // Convert to JSON string
    let jsonOutput = JSON.stringify(output, null, 2);

    // Apply token limit truncation if configured
    const tokenLimit = context.tokenLimit ?? DEFAULTS.TOKEN_LIMIT;
    const tokenResult = truncateToTokens(jsonOutput, { maxTokens: tokenLimit });

    if (tokenResult.truncated) {
      logger.info('Response truncated due to token limit', {
        originalTokens: tokenResult.originalTokens,
        finalTokens: tokenResult.finalTokens,
        tokenLimit,
        requestId: context.requestId,
      });
      jsonOutput = tokenResult.text;
    }

    return createToolResult(jsonOutput);
  } catch (error) {
    logger.error('Read query failed', {
      error: error instanceof Error ? error.message : String(error),
      requestId: context.requestId,
    });

    return createToolResult(
      JSON.stringify({
        error: 'Query execution failed',
        message: error instanceof Error ? error.message : String(error),
        query: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
      }, null, 2),
      true
    );
  }
}

/**
 * Execute write_neo4j_cypher tool
 */
async function executeWriteCypher(
  args: Record<string, unknown> | undefined,
  context: HandlerContext
): Promise<McpToolResult> {
  // Check if writes are allowed
  if (context.readOnly) {
    return createToolResult(
      JSON.stringify({
        error: 'Write operations disabled',
        message: 'This connection is configured as read-only. Write operations are not permitted.',
      }, null, 2),
      true
    );
  }

  if (!args || typeof args.query !== 'string') {
    throw new InvalidParamsError('Missing required parameter: query');
  }

  const query = args.query;
  const rawParams = getOptionalObjectParam(args, 'params');

  logger.info('Executing write_neo4j_cypher', {
    queryLength: query.length,
    hasParams: !!rawParams,
    requestId: context.requestId,
  });

  // Security validation
  const securityCheck = validateQuery(query);
  if (!securityCheck.valid) {
    logger.warn('Query blocked by security validation', {
      error: securityCheck.error,
      requestId: context.requestId,
    });
    throw new ValidationError(securityCheck.error ?? 'Query blocked for security reasons');
  }

  // Log warnings if any
  if (securityCheck.warnings.length > 0) {
    logger.info('Query warnings', { warnings: securityCheck.warnings, requestId: context.requestId });
  }

  // Sanitize parameters
  const params = sanitizeParameters(rawParams);

  // Validate query syntax
  const syntaxCheck = validateCypherSyntax(query);
  if (!syntaxCheck.valid) {
    throw new ValidationError(syntaxCheck.error ?? 'Invalid query syntax');
  }

  // Check if Neo4j client is available
  if (!context.neo4jClient) {
    return createToolResult(
      JSON.stringify({
        error: 'No Neo4j connection configured',
        message: 'Please configure your Neo4j connection via the setup endpoint first.',
        query: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
      }, null, 2),
      true
    );
  }

  try {
    // Execute write query
    const result = await executeWriteQuery(
      context.neo4jClient,
      query,
      params,
      { timeout: context.timeout ?? DEFAULTS.READ_TIMEOUT }
    );

    // Format result
    const output = {
      success: true,
      summary: result.summary,
      counters: result.counters,
    };

    return createToolResult(JSON.stringify(output, null, 2));
  } catch (error) {
    logger.error('Write query failed', {
      error: error instanceof Error ? error.message : String(error),
      requestId: context.requestId,
    });

    return createToolResult(
      JSON.stringify({
        error: 'Query execution failed',
        message: error instanceof Error ? error.message : String(error),
        query: query.substring(0, 100) + (query.length > 100 ? '...' : ''),
      }, null, 2),
      true
    );
  }
}

/**
 * Create a tool result with text content
 */
function createToolResult(text: string, isError: boolean = false): McpToolResult {
  const content: McpToolResultContent[] = [
    {
      type: 'text',
      text,
    },
  ];

  return {
    content,
    ...(isError && { isError: true }),
  };
}

/**
 * Route a request to the appropriate handler
 */
export async function routeRequest(
  request: JsonRpcRequest,
  context: HandlerContext
): Promise<HandlerResult> {
  const { method } = request;

  try {
    switch (method) {
      case MCP_METHODS.INITIALIZE:
        return { type: 'response', result: handleInitialize(request, context) };

      case MCP_METHODS.INITIALIZED:
        handleInitialized(request, context);
        return { type: 'notification' };

      case MCP_METHODS.TOOLS_LIST:
        return { type: 'response', result: handleToolsList(request, context) };

      case MCP_METHODS.TOOLS_CALL:
        const result = await handleToolsCall(request, context);
        return { type: 'response', result };

      case MCP_METHODS.PING:
        return { type: 'response', result: {} };

      default:
        throw new MethodNotFoundError(method);
    }
  } catch (error) {
    return { type: 'error', error: error instanceof Error ? error : new Error(String(error)) };
  }
}
