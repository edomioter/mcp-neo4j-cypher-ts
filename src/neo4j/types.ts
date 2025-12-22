/**
 * Neo4j Types
 *
 * Type definitions specific to Neo4j HTTP API interactions.
 */

// ============================================
// Neo4j HTTP API Request/Response Types
// ============================================

/**
 * Neo4j HTTP API Query Request body
 */
export interface Neo4jHttpRequest {
  statement: string;
  parameters?: Record<string, unknown>;
  includeCounters?: boolean;
}

/**
 * Neo4j HTTP API Response
 */
export interface Neo4jHttpResponse {
  data?: Neo4jResponseData;
  counters?: Neo4jQueryCounters;
  profiledQueryPlan?: unknown;
  notifications?: Neo4jNotification[];
  errors?: Neo4jResponseError[];
  bookmarks?: string[];
}

/**
 * Neo4j Response Data structure
 */
export interface Neo4jResponseData {
  fields: string[];
  values: Neo4jValue[][];
}

/**
 * Neo4j primitive value types
 */
export type Neo4jPrimitive = null | boolean | number | string;

/**
 * Neo4j Value - can be various types
 * Using interface for recursive type to avoid circular reference
 */
export type Neo4jValue =
  | Neo4jPrimitive
  | Neo4jNode
  | Neo4jRelationship
  | Neo4jPath
  | Neo4jValueArray
  | Neo4jValueMap;

/**
 * Neo4j Value Array (for recursive support)
 */
export interface Neo4jValueArray extends Array<Neo4jValue> {}

/**
 * Neo4j Value Map (for recursive support)
 */
export interface Neo4jValueMap {
  [key: string]: Neo4jValue;
}

/**
 * Neo4j Node structure from HTTP API
 */
export interface Neo4jNode {
  _element_id?: string;
  _labels?: string[];
  [key: string]: unknown;
}

/**
 * Neo4j Relationship structure from HTTP API
 */
export interface Neo4jRelationship {
  _element_id?: string;
  _start_node_element_id?: string;
  _end_node_element_id?: string;
  _type?: string;
  [key: string]: unknown;
}

/**
 * Neo4j Path structure
 */
export interface Neo4jPath {
  _nodes: Neo4jNode[];
  _relationships: Neo4jRelationship[];
}

/**
 * Neo4j Query Counters
 */
export interface Neo4jQueryCounters {
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
  containsSystemUpdates?: boolean;
  systemUpdates?: number;
}

/**
 * Neo4j Response Error
 */
export interface Neo4jResponseError {
  code: string;
  message: string;
}

/**
 * Neo4j Notification (warnings, hints)
 */
export interface Neo4jNotification {
  code: string;
  title: string;
  description: string;
  severity: 'WARNING' | 'INFORMATION';
  position?: {
    line: number;
    column: number;
    offset: number;
  };
}

// ============================================
// Schema Types
// ============================================

/**
 * APOC meta.schema result structure
 */
export interface ApocSchemaResult {
  [labelOrType: string]: ApocSchemaEntry;
}

/**
 * APOC Schema Entry for a label or relationship type
 */
export interface ApocSchemaEntry {
  type: 'node' | 'relationship';
  count?: number;
  properties?: Record<string, ApocPropertyInfo>;
  relationships?: Record<string, ApocRelationshipInfo>;
}

/**
 * APOC Property Info
 */
export interface ApocPropertyInfo {
  type: string | string[];
  indexed?: boolean;
  unique?: boolean;
  existence?: boolean;
}

/**
 * APOC Relationship Info
 */
export interface ApocRelationshipInfo {
  count?: number;
  direction?: 'out' | 'in' | 'both';
  labels?: string[];
  properties?: Record<string, ApocPropertyInfo>;
}

/**
 * Processed Schema for LLM consumption
 */
export interface ProcessedSchema {
  labels: ProcessedLabel[];
  relationshipTypes: ProcessedRelationshipType[];
  summary: string;
}

/**
 * Processed Label information
 */
export interface ProcessedLabel {
  name: string;
  count?: number;
  properties: ProcessedProperty[];
  outgoingRelationships: ProcessedRelationship[];
  incomingRelationships: ProcessedRelationship[];
}

/**
 * Processed Property information
 */
export interface ProcessedProperty {
  name: string;
  type: string;
  indexed?: boolean;
  unique?: boolean;
}

/**
 * Processed Relationship information
 */
export interface ProcessedRelationship {
  type: string;
  targetLabel: string;
  count?: number;
}

/**
 * Processed Relationship Type
 */
export interface ProcessedRelationshipType {
  name: string;
  count?: number;
  properties: ProcessedProperty[];
  startLabels: string[];
  endLabels: string[];
}

// ============================================
// Query Result Types
// ============================================

/**
 * Transformed query result for MCP response
 */
export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  truncated?: boolean;
}

/**
 * Write query result with counters
 */
export interface WriteResult {
  counters: Neo4jQueryCounters;
  summary: string;
}

// ============================================
// Connection Types
// ============================================

/**
 * Neo4j connection configuration
 */
export interface Neo4jConnectionConfig {
  uri: string;
  username: string;
  password: string;
  database: string;
}

/**
 * Query execution options
 */
export interface QueryOptions {
  timeout?: number;
  readOnly?: boolean;
  includeCounters?: boolean;
}

/**
 * Client configuration
 */
export interface Neo4jClientConfig {
  connection: Neo4jConnectionConfig;
  defaultTimeout: number;
  tokenLimit: number;
  schemaSampleSize: number;
}
