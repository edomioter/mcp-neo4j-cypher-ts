/**
 * Query Validator
 *
 * Validates Cypher queries for security concerns.
 * Blocks dangerous operations and detects potential issues.
 */

import * as logger from '../utils/logger.js';

/**
 * Query validation result
 */
export interface QueryValidationResult {
  /** Whether the query is valid and safe */
  valid: boolean;
  /** Error message if invalid */
  error?: string;
  /** Warnings (non-blocking) */
  warnings: string[];
  /** Detected query type */
  queryType: 'read' | 'write' | 'admin' | 'unknown';
}

/**
 * Dangerous Cypher operations that should be blocked
 */
const DANGEROUS_OPERATIONS = [
  // Database administration
  { pattern: /\bCREATE\s+DATABASE\b/i, message: 'CREATE DATABASE is not allowed' },
  { pattern: /\bDROP\s+DATABASE\b/i, message: 'DROP DATABASE is not allowed' },
  { pattern: /\bSTOP\s+DATABASE\b/i, message: 'STOP DATABASE is not allowed' },
  { pattern: /\bSTART\s+DATABASE\b/i, message: 'START DATABASE is not allowed' },

  // User management
  { pattern: /\bCREATE\s+USER\b/i, message: 'CREATE USER is not allowed' },
  { pattern: /\bDROP\s+USER\b/i, message: 'DROP USER is not allowed' },
  { pattern: /\bALTER\s+USER\b/i, message: 'ALTER USER is not allowed' },
  { pattern: /\bCREATE\s+ROLE\b/i, message: 'CREATE ROLE is not allowed' },
  { pattern: /\bDROP\s+ROLE\b/i, message: 'DROP ROLE is not allowed' },
  { pattern: /\bGRANT\b/i, message: 'GRANT is not allowed' },
  { pattern: /\bREVOKE\b/i, message: 'REVOKE is not allowed' },
  { pattern: /\bDENY\b/i, message: 'DENY is not allowed' },

  // Potentially destructive operations
  { pattern: /\bDETACH\s+DELETE\b/i, message: 'DETACH DELETE is potentially dangerous - use with caution' },
  { pattern: /\bCALL\s+\{/i, message: 'Subquery CALL blocks may be restricted' },

  // System procedures (block most)
  { pattern: /\bCALL\s+dbms\./i, message: 'System DBMS procedures are not allowed' },
  { pattern: /\bCALL\s+db\.(?!labels|relationshipTypes|propertyKeys|schema)/i, message: 'Most db.* procedures are not allowed' },

  // Load CSV from remote URLs (potential SSRF)
  { pattern: /\bLOAD\s+CSV\s+FROM\s+['"]https?:/i, message: 'LOAD CSV from remote URLs is not allowed' },
];

/**
 * Operations that indicate a write query
 */
const WRITE_OPERATIONS = [
  /\bCREATE\b/i,
  /\bMERGE\b/i,
  /\bDELETE\b/i,
  /\bSET\b/i,
  /\bREMOVE\b/i,
  /\bFOREACH\b/i,
];

/**
 * Operations that indicate an admin query
 */
const ADMIN_OPERATIONS = [
  /\bCREATE\s+(INDEX|CONSTRAINT|DATABASE|USER|ROLE)\b/i,
  /\bDROP\s+(INDEX|CONSTRAINT|DATABASE|USER|ROLE)\b/i,
  /\bALTER\b/i,
  /\bGRANT\b/i,
  /\bREVOKE\b/i,
];

/**
 * Patterns that generate warnings but don't block
 */
const WARNING_PATTERNS = [
  { pattern: /MATCH\s+\([^)]*\)\s*(?!WHERE|RETURN|-)/i, message: 'Unbounded MATCH may return large results' },
  { pattern: /\bLIMIT\s+(\d+)/i, check: (match: RegExpMatchArray) => {
    const limit = parseInt(match[1] ?? '0', 10);
    return limit > 10000 ? 'Large LIMIT value may cause performance issues' : null;
  }},
];

/**
 * Maximum query length (characters)
 */
const MAX_QUERY_LENGTH = 50000;

/**
 * Validate a Cypher query for security concerns
 *
 * @param query - The Cypher query to validate
 * @returns Validation result
 */
export function validateQuery(query: string): QueryValidationResult {
  const warnings: string[] = [];

  // Check query length
  if (query.length > MAX_QUERY_LENGTH) {
    return {
      valid: false,
      error: `Query too long (${query.length} chars). Maximum allowed: ${MAX_QUERY_LENGTH}`,
      warnings: [],
      queryType: 'unknown',
    };
  }

  // Check for empty query
  if (!query.trim()) {
    return {
      valid: false,
      error: 'Query cannot be empty',
      warnings: [],
      queryType: 'unknown',
    };
  }

  // Normalize query for pattern matching (remove comments)
  const normalizedQuery = removeComments(query);

  // Check for dangerous operations
  for (const { pattern, message } of DANGEROUS_OPERATIONS) {
    if (pattern.test(normalizedQuery)) {
      logger.warn('Dangerous query blocked', {
        reason: message,
        queryPreview: query.substring(0, 100),
      });

      return {
        valid: false,
        error: message,
        warnings: [],
        queryType: 'admin',
      };
    }
  }

  // Determine query type
  const queryType = detectQueryType(normalizedQuery);

  // Check for warning patterns
  for (const { pattern, check, message } of WARNING_PATTERNS) {
    const match = normalizedQuery.match(pattern);
    if (match) {
      if (check) {
        const warningMessage = check(match);
        if (warningMessage) {
          warnings.push(warningMessage);
        }
      } else if (message) {
        warnings.push(message);
      }
    }
  }

  return {
    valid: true,
    warnings,
    queryType,
  };
}

/**
 * Remove comments from Cypher query
 */
function removeComments(query: string): string {
  // Remove single-line comments
  let result = query.replace(/\/\/.*$/gm, '');

  // Remove multi-line comments
  result = result.replace(/\/\*[\s\S]*?\*\//g, '');

  return result;
}

/**
 * Detect the type of query
 */
function detectQueryType(query: string): 'read' | 'write' | 'admin' | 'unknown' {
  // Check for admin operations first
  for (const pattern of ADMIN_OPERATIONS) {
    if (pattern.test(query)) {
      return 'admin';
    }
  }

  // Check for write operations
  for (const pattern of WRITE_OPERATIONS) {
    if (pattern.test(query)) {
      return 'write';
    }
  }

  // If it has MATCH or RETURN, it's likely a read
  if (/\b(MATCH|RETURN|WITH|UNWIND|CALL)\b/i.test(query)) {
    return 'read';
  }

  return 'unknown';
}

/**
 * Check if a query is a read-only query
 *
 * @param query - The Cypher query to check
 * @returns true if the query is read-only
 */
export function isReadOnlyQuery(query: string): boolean {
  const normalizedQuery = removeComments(query);
  const queryType = detectQueryType(normalizedQuery);
  return queryType === 'read' || queryType === 'unknown';
}

/**
 * Check if a query contains write operations
 *
 * @param query - The Cypher query to check
 * @returns true if the query contains write operations
 */
export function containsWriteOperations(query: string): boolean {
  const normalizedQuery = removeComments(query);
  return WRITE_OPERATIONS.some(pattern => pattern.test(normalizedQuery));
}

/**
 * Sanitize query parameters
 *
 * Validates and cleans query parameters to prevent injection.
 *
 * @param params - Query parameters
 * @returns Sanitized parameters
 */
export function sanitizeParameters(
  params: Record<string, unknown> | undefined
): Record<string, unknown> | undefined {
  if (!params) {
    return undefined;
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(params)) {
    // Validate key (alphanumeric and underscore only)
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
      logger.warn('Invalid parameter key filtered', { key });
      continue;
    }

    // Validate value type
    if (
      value === null ||
      value === undefined ||
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      Array.isArray(value) ||
      (typeof value === 'object' && value !== null)
    ) {
      sanitized[key] = value;
    } else {
      logger.warn('Invalid parameter value filtered', { key, type: typeof value });
    }
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}
