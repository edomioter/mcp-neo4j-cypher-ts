/**
 * MCP Neo4j Cypher Server - Type Definitions
 *
 * This file contains all TypeScript interfaces and types used throughout
 * the application, organized by domain.
 */

// ============================================
// Cloudflare Workers Environment
// ============================================

/**
 * Cloudflare Workers environment bindings
 */
export interface Env {
  // D1 Database
  DB: D1Database;

  // KV Namespace for sessions and cache
  SESSIONS: KVNamespace;

  // Secrets
  ENCRYPTION_KEY: string;

  // Environment variables
  ENVIRONMENT: string;
  DEFAULT_READ_TIMEOUT: string;
  DEFAULT_TOKEN_LIMIT: string;
  DEFAULT_SCHEMA_SAMPLE: string;
  ALLOWED_ORIGINS: string;
}

// ============================================
// JSON-RPC 2.0 / MCP Protocol Types
// ============================================

/**
 * JSON-RPC 2.0 Request
 */
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

/**
 * JSON-RPC 2.0 Success Response
 */
export interface JsonRpcSuccessResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result: unknown;
}

/**
 * JSON-RPC 2.0 Error Response
 */
export interface JsonRpcErrorResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  error: JsonRpcError;
}

/**
 * JSON-RPC 2.0 Error object
 */
export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

/**
 * Union type for JSON-RPC responses
 */
export type JsonRpcResponse = JsonRpcSuccessResponse | JsonRpcErrorResponse;

/**
 * Standard JSON-RPC error codes
 */
export const JSON_RPC_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  // Custom MCP error codes
  NEO4J_CONNECTION_ERROR: -32001,
  NEO4J_QUERY_ERROR: -32002,
  AUTHENTICATION_ERROR: -32003,
  RATE_LIMIT_ERROR: -32004,
  VALIDATION_ERROR: -32005,
} as const;

// ============================================
// MCP Protocol Types
// ============================================

/**
 * MCP Server Information
 */
export interface McpServerInfo {
  name: string;
  version: string;
}

/**
 * MCP Server Capabilities
 */
export interface McpCapabilities {
  tools?: Record<string, unknown>;
  resources?: Record<string, unknown>;
  prompts?: Record<string, unknown>;
}

/**
 * MCP Initialize Result
 */
export interface McpInitializeResult {
  protocolVersion: string;
  serverInfo: McpServerInfo;
  capabilities: McpCapabilities;
}

/**
 * MCP Tool Definition
 */
export interface McpTool {
  name: string;
  description: string;
  inputSchema: McpToolInputSchema;
}

/**
 * MCP Tool Input Schema (JSON Schema format)
 */
export interface McpToolInputSchema {
  type: 'object';
  properties: Record<string, McpToolProperty>;
  required?: string[];
}

/**
 * MCP Tool Property Definition
 */
export interface McpToolProperty {
  type: string;
  description: string;
  default?: unknown;
  enum?: unknown[];
}

/**
 * MCP Tool Call Parameters
 */
export interface McpToolCallParams {
  name: string;
  arguments?: Record<string, unknown>;
}

/**
 * MCP Tool Result Content
 */
export interface McpToolResultContent {
  type: 'text' | 'image' | 'resource';
  text?: string;
  data?: string;
  mimeType?: string;
}

/**
 * MCP Tool Result
 */
export interface McpToolResult {
  content: McpToolResultContent[];
  isError?: boolean;
}

/**
 * MCP Tools List Result
 */
export interface McpToolsListResult {
  tools: McpTool[];
}

// ============================================
// Neo4j Types
// ============================================

/**
 * Neo4j Connection Configuration (decrypted)
 */
export interface Neo4jConnection {
  uri: string;
  username: string;
  password: string;
  database: string;
}

/**
 * Neo4j Connection from D1 (encrypted)
 */
export interface Neo4jConnectionRecord {
  id: string;
  user_id: string;
  name: string;
  neo4j_uri_encrypted: string;
  neo4j_user_encrypted: string;
  neo4j_password_encrypted: string;
  neo4j_database: string;
  read_only: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

/**
 * Neo4j HTTP API Query Request
 */
export interface Neo4jQueryRequest {
  statement: string;
  parameters?: Record<string, unknown>;
  includeCounters?: boolean;
}

/**
 * Neo4j HTTP API Query Response
 */
export interface Neo4jQueryResponse {
  data: Neo4jQueryData;
  counters?: Neo4jCounters;
  bookmarks?: string[];
}

/**
 * Neo4j Query Data
 */
export interface Neo4jQueryData {
  fields: string[];
  values: unknown[][];
}

/**
 * Neo4j Query Counters (for write operations)
 */
export interface Neo4jCounters {
  nodesCreated?: number;
  nodesDeleted?: number;
  relationshipsCreated?: number;
  relationshipsDeleted?: number;
  propertiesSet?: number;
  labelsAdded?: number;
  labelsRemoved?: number;
  indexesAdded?: number;
  indexesRemoved?: number;
  constraintsAdded?: number;
  constraintsRemoved?: number;
  containsUpdates?: boolean;
}

/**
 * Neo4j HTTP API Error Response
 */
export interface Neo4jErrorResponse {
  errors: Neo4jError[];
}

/**
 * Neo4j Error
 */
export interface Neo4jError {
  code: string;
  message: string;
}

/**
 * Neo4j Schema Label
 */
export interface Neo4jSchemaLabel {
  label: string;
  properties: Neo4jSchemaProperty[];
  relationships: Neo4jSchemaRelationship[];
}

/**
 * Neo4j Schema Property
 */
export interface Neo4jSchemaProperty {
  name: string;
  type: string;
  indexed?: boolean;
  unique?: boolean;
}

/**
 * Neo4j Schema Relationship
 */
export interface Neo4jSchemaRelationship {
  type: string;
  direction: 'OUTGOING' | 'INCOMING';
  targetLabel: string;
}

/**
 * Neo4j Schema Result
 */
export interface Neo4jSchema {
  labels: Neo4jSchemaLabel[];
  relationshipTypes: string[];
  propertyKeys: string[];
}

// ============================================
// User and Session Types
// ============================================

/**
 * User Record from D1
 */
export interface UserRecord {
  id: string;
  email: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Session Data stored in KV
 */
export interface SessionData {
  userId: string;
  connectionId: string;
  createdAt: number;
  expiresAt: number;
}

/**
 * Request Context (after authentication)
 */
export interface RequestContext {
  userId: string;
  connectionId: string;
  connection: Neo4jConnection;
  readOnly: boolean;
}

// ============================================
// Configuration Types
// ============================================

/**
 * Server Configuration
 */
export interface ServerConfig {
  readTimeout: number;
  tokenLimit: number;
  schemaSampleSize: number;
  allowedOrigins: string[];
  environment: 'development' | 'staging' | 'production';
}

/**
 * Tool Execution Options
 */
export interface ToolExecutionOptions {
  timeout?: number;
  tokenLimit?: number;
}

// ============================================
// Utility Types
// ============================================

/**
 * Result type for operations that can fail
 */
export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

/**
 * Async Result type
 */
export type AsyncResult<T, E = Error> = Promise<Result<T, E>>;

/**
 * Log Entry
 */
export interface LogEntry {
  timestamp: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  context?: Record<string, unknown>;
}

/**
 * Rate Limit Info
 */
export interface RateLimitInfo {
  remaining: number;
  reset: number;
  limit: number;
}
