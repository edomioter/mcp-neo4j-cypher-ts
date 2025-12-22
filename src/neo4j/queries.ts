/**
 * Neo4j Query Execution
 *
 * Handles query execution, result transformation,
 * and validation for read/write operations.
 */

import type { Neo4jClient } from './client.js';
import type {
  QueryResult,
  WriteResult,
  Neo4jQueryCounters,
  Neo4jValue,
  Neo4jNode,
  Neo4jRelationship,
  QueryOptions,
} from './types.js';
import { ValidationError } from '../utils/errors.js';
import * as logger from '../utils/logger.js';

/**
 * Execute a read query and transform results
 */
export async function executeReadQuery(
  client: Neo4jClient,
  cypher: string,
  params?: Record<string, unknown>,
  options?: QueryOptions
): Promise<QueryResult> {
  // Validate this is a read query
  if (isWriteQuery(cypher)) {
    throw new ValidationError(
      'This query contains write operations. Use executeWriteQuery for CREATE, MERGE, DELETE, SET, or REMOVE operations.'
    );
  }

  logger.info('Executing read query', {
    cypherLength: cypher.length,
    hasParams: !!params,
  });

  const result = await client.query(cypher, params, {
    ...options,
    includeCounters: false,
  });

  return transformQueryResult(result.data);
}

/**
 * Execute a write query and return counters
 */
export async function executeWriteQuery(
  client: Neo4jClient,
  cypher: string,
  params?: Record<string, unknown>,
  options?: QueryOptions
): Promise<WriteResult> {
  logger.info('Executing write query', {
    cypherLength: cypher.length,
    hasParams: !!params,
  });

  const result = await client.query(cypher, params, {
    ...options,
    includeCounters: true,
  });

  const counters = result.counters ?? {};
  const summary = generateWriteSummary(counters);

  return { counters, summary };
}

/**
 * Check if a query contains write operations
 */
export function isWriteQuery(cypher: string): boolean {
  const normalizedQuery = cypher
    .toLowerCase()
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove block comments
    .replace(/\/\/.*$/gm, '') // Remove line comments
    .replace(/\s+/g, ' ')
    .trim();

  // Write operation patterns
  const writePatterns = [
    /\bcreate\s/,
    /\bmerge\s/,
    /\bdelete\s/,
    /\bdetach\s+delete\s/,
    /\bset\s/,
    /\bremove\s/,
    /\bdrop\s/,
    /\bcall\s*\{[^}]*\b(create|merge|delete|set|remove)\b/,
    /\bforeach\s*\(/,
  ];

  return writePatterns.some((pattern) => pattern.test(normalizedQuery));
}

/**
 * Transform Neo4j query result to our format
 */
function transformQueryResult(
  data?: { fields: string[]; values: Neo4jValue[][] }
): QueryResult {
  if (!data) {
    return {
      columns: [],
      rows: [],
      rowCount: 0,
    };
  }

  const columns = data.fields;
  const rows: Record<string, unknown>[] = [];

  for (const valueRow of data.values) {
    const row: Record<string, unknown> = {};

    for (let i = 0; i < columns.length; i++) {
      const colName = columns[i];
      const value = valueRow[i];

      if (colName !== undefined && value !== undefined) {
        row[colName] = transformValue(value);
      } else if (colName !== undefined) {
        row[colName] = null;
      }
    }

    rows.push(row);
  }

  return {
    columns,
    rows,
    rowCount: rows.length,
  };
}

/**
 * Transform a Neo4j value to a plain JavaScript value
 */
function transformValue(value: Neo4jValue): unknown {
  if (value === null || value === undefined) {
    return null;
  }

  // Handle arrays
  if (Array.isArray(value)) {
    return value.map(transformValue);
  }

  // Handle Neo4j Node
  if (isNeo4jNode(value)) {
    return transformNode(value);
  }

  // Handle Neo4j Relationship
  if (isNeo4jRelationship(value)) {
    return transformRelationship(value);
  }

  // Handle plain objects (maps)
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = transformValue(val as Neo4jValue);
    }
    return result;
  }

  // Return primitives as-is
  return value;
}

/**
 * Check if value is a Neo4j Node
 */
function isNeo4jNode(value: unknown): value is Neo4jNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    '_element_id' in value &&
    '_labels' in value
  );
}

/**
 * Check if value is a Neo4j Relationship
 */
function isNeo4jRelationship(value: unknown): value is Neo4jRelationship {
  return (
    typeof value === 'object' &&
    value !== null &&
    '_element_id' in value &&
    '_type' in value &&
    '_start_node_element_id' in value
  );
}

/**
 * Transform Neo4j Node to plain object
 */
function transformNode(node: Neo4jNode): Record<string, unknown> {
  const result: Record<string, unknown> = {
    _labels: node._labels,
  };

  // Copy all properties except internal ones
  for (const [key, value] of Object.entries(node)) {
    if (!key.startsWith('_')) {
      result[key] = transformValue(value as Neo4jValue);
    }
  }

  return result;
}

/**
 * Transform Neo4j Relationship to plain object
 */
function transformRelationship(rel: Neo4jRelationship): Record<string, unknown> {
  const result: Record<string, unknown> = {
    _type: rel._type,
  };

  // Copy all properties except internal ones
  for (const [key, value] of Object.entries(rel)) {
    if (!key.startsWith('_')) {
      result[key] = transformValue(value as Neo4jValue);
    }
  }

  return result;
}

/**
 * Generate a summary of write operation results
 */
function generateWriteSummary(counters: Neo4jQueryCounters): string {
  const parts: string[] = [];

  if (counters.nodesCreated && counters.nodesCreated > 0) {
    parts.push(`${counters.nodesCreated} node(s) created`);
  }
  if (counters.nodesDeleted && counters.nodesDeleted > 0) {
    parts.push(`${counters.nodesDeleted} node(s) deleted`);
  }
  if (counters.relationshipsCreated && counters.relationshipsCreated > 0) {
    parts.push(`${counters.relationshipsCreated} relationship(s) created`);
  }
  if (counters.relationshipsDeleted && counters.relationshipsDeleted > 0) {
    parts.push(`${counters.relationshipsDeleted} relationship(s) deleted`);
  }
  if (counters.propertiesSet && counters.propertiesSet > 0) {
    parts.push(`${counters.propertiesSet} property(ies) set`);
  }
  if (counters.labelsAdded && counters.labelsAdded > 0) {
    parts.push(`${counters.labelsAdded} label(s) added`);
  }
  if (counters.labelsRemoved && counters.labelsRemoved > 0) {
    parts.push(`${counters.labelsRemoved} label(s) removed`);
  }
  if (counters.indexesAdded && counters.indexesAdded > 0) {
    parts.push(`${counters.indexesAdded} index(es) added`);
  }
  if (counters.indexesRemoved && counters.indexesRemoved > 0) {
    parts.push(`${counters.indexesRemoved} index(es) removed`);
  }
  if (counters.constraintsAdded && counters.constraintsAdded > 0) {
    parts.push(`${counters.constraintsAdded} constraint(s) added`);
  }
  if (counters.constraintsRemoved && counters.constraintsRemoved > 0) {
    parts.push(`${counters.constraintsRemoved} constraint(s) removed`);
  }

  if (parts.length === 0) {
    return 'No changes made';
  }

  return parts.join(', ');
}

/**
 * Validate query syntax (basic validation)
 */
export function validateCypherSyntax(cypher: string): { valid: boolean; error?: string } {
  const trimmed = cypher.trim();

  if (trimmed.length === 0) {
    return { valid: false, error: 'Query cannot be empty' };
  }

  // Check for unbalanced parentheses
  let parenCount = 0;
  let bracketCount = 0;
  let braceCount = 0;

  for (const char of trimmed) {
    switch (char) {
      case '(':
        parenCount++;
        break;
      case ')':
        parenCount--;
        break;
      case '[':
        bracketCount++;
        break;
      case ']':
        bracketCount--;
        break;
      case '{':
        braceCount++;
        break;
      case '}':
        braceCount--;
        break;
    }

    if (parenCount < 0 || bracketCount < 0 || braceCount < 0) {
      return { valid: false, error: 'Unbalanced brackets in query' };
    }
  }

  if (parenCount !== 0) {
    return { valid: false, error: 'Unbalanced parentheses in query' };
  }
  if (bracketCount !== 0) {
    return { valid: false, error: 'Unbalanced square brackets in query' };
  }
  if (braceCount !== 0) {
    return { valid: false, error: 'Unbalanced curly braces in query' };
  }

  return { valid: true };
}
