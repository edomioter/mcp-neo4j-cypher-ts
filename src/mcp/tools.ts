/**
 * MCP Tools Definition
 *
 * Defines the MCP tools available in this server:
 * - get_neo4j_schema: Retrieve database schema
 * - read_neo4j_cypher: Execute read-only Cypher queries
 * - write_neo4j_cypher: Execute write Cypher queries
 */

import type { McpTool } from '../types.js';
import { TOOL_NAMES, DEFAULTS } from '../config/constants.js';

/**
 * Tool: get_neo4j_schema
 *
 * Retrieves the schema of the connected Neo4j database including
 * node labels, relationship types, and property information.
 */
export const getSchemaToolDefinition: McpTool = {
  name: TOOL_NAMES.GET_SCHEMA,
  description: `Retrieve the schema of the Neo4j database. Returns information about node labels, their properties (with types), and relationships between them. Use this tool first to understand the database structure before writing queries.`,
  inputSchema: {
    type: 'object',
    properties: {
      sample_size: {
        type: 'number',
        description: `Number of nodes to sample for schema inference. Higher values give more accurate type information but take longer. Default: ${DEFAULTS.SCHEMA_SAMPLE_SIZE}`,
        default: DEFAULTS.SCHEMA_SAMPLE_SIZE,
      },
    },
    required: [],
  },
};

/**
 * Tool: read_neo4j_cypher
 *
 * Executes read-only Cypher queries against the Neo4j database.
 */
export const readCypherToolDefinition: McpTool = {
  name: TOOL_NAMES.READ_CYPHER,
  description: `Execute a read-only Cypher query against the Neo4j database. Use this for MATCH, RETURN, and other read operations. The query must not contain any write operations (CREATE, MERGE, DELETE, SET, REMOVE). Returns query results as JSON.`,
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The Cypher query to execute. Must be a read-only query.',
      },
      params: {
        type: 'object',
        description: 'Optional parameters for the Cypher query. Use $paramName syntax in the query to reference parameters.',
      },
    },
    required: ['query'],
  },
};

/**
 * Tool: write_neo4j_cypher
 *
 * Executes write Cypher queries against the Neo4j database.
 */
export const writeCypherToolDefinition: McpTool = {
  name: TOOL_NAMES.WRITE_CYPHER,
  description: `Execute a write Cypher query against the Neo4j database. Use this for CREATE, MERGE, DELETE, SET, and REMOVE operations. Returns the count of affected nodes/relationships. This tool may be disabled if the connection is configured as read-only.`,
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The Cypher query to execute. Should contain write operations.',
      },
      params: {
        type: 'object',
        description: 'Optional parameters for the Cypher query. Use $paramName syntax in the query to reference parameters.',
      },
    },
    required: ['query'],
  },
};

/**
 * Get all tool definitions
 *
 * @param includeWriteTool - Whether to include the write tool (false if read-only mode)
 */
export function getAllTools(includeWriteTool: boolean = true): McpTool[] {
  const tools: McpTool[] = [
    getSchemaToolDefinition,
    readCypherToolDefinition,
  ];

  if (includeWriteTool) {
    tools.push(writeCypherToolDefinition);
  }

  return tools;
}

/**
 * Get a tool definition by name
 */
export function getToolByName(name: string): McpTool | undefined {
  switch (name) {
    case TOOL_NAMES.GET_SCHEMA:
      return getSchemaToolDefinition;
    case TOOL_NAMES.READ_CYPHER:
      return readCypherToolDefinition;
    case TOOL_NAMES.WRITE_CYPHER:
      return writeCypherToolDefinition;
    default:
      return undefined;
  }
}

/**
 * Check if a tool exists
 */
export function toolExists(name: string): boolean {
  return getToolByName(name) !== undefined;
}

/**
 * Validate that a tool name is valid
 */
export function isValidToolName(name: string): name is keyof typeof TOOL_NAMES {
  return Object.values(TOOL_NAMES).includes(name as typeof TOOL_NAMES[keyof typeof TOOL_NAMES]);
}
