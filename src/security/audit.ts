/**
 * Security Audit Logging
 *
 * Specialized logging for security-relevant events.
 * Logs access, authentication, and query execution.
 */

import * as logger from '../utils/logger.js';

/**
 * Audit event types
 */
export type AuditEventType =
  | 'auth_success'
  | 'auth_failure'
  | 'auth_token_invalid'
  | 'auth_session_expired'
  | 'rate_limit_exceeded'
  | 'query_executed'
  | 'query_blocked'
  | 'setup_attempt'
  | 'setup_success'
  | 'setup_failure'
  | 'connection_test'
  | 'token_created'
  | 'token_revoked'
  | 'token_list_accessed'
  | 'token_revoke_attempt'
  | 'suspicious_activity';

/**
 * Audit log entry
 */
export interface AuditEntry {
  /** Event type */
  event: AuditEventType;
  /** Timestamp */
  timestamp: string;
  /** Request ID */
  requestId?: string;
  /** User ID (if authenticated) */
  userId?: string;
  /** Client IP */
  clientIp?: string;
  /** User agent */
  userAgent?: string;
  /** Additional event-specific data */
  data?: Record<string, unknown>;
}

/**
 * Create a base audit entry
 */
function createAuditEntry(
  event: AuditEventType,
  request?: Request,
  context?: {
    requestId?: string;
    userId?: string;
    data?: Record<string, unknown>;
  }
): AuditEntry {
  const entry: AuditEntry = {
    event,
    timestamp: new Date().toISOString(),
  };

  if (context?.requestId) {
    entry.requestId = context.requestId;
  }

  if (context?.userId) {
    entry.userId = context.userId;
  }

  if (request) {
    // Get client IP (prefer CF header, fallback to X-Forwarded-For)
    const cfIp = request.headers.get('CF-Connecting-IP');
    const forwardedFor = request.headers.get('X-Forwarded-For');
    entry.clientIp = cfIp || forwardedFor?.split(',')[0]?.trim() || 'unknown';

    // Get user agent (truncate for safety)
    const userAgent = request.headers.get('User-Agent');
    if (userAgent) {
      entry.userAgent = userAgent.substring(0, 200);
    }
  }

  if (context?.data) {
    entry.data = context.data;
  }

  return entry;
}

/**
 * Log authentication success
 */
export function logAuthSuccess(
  request: Request,
  userId: string,
  requestId?: string
): void {
  const entry = createAuditEntry('auth_success', request, {
    requestId,
    userId,
  });

  logger.info('AUDIT: Authentication successful', { ...entry });
}

/**
 * Log authentication failure
 */
export function logAuthFailure(
  request: Request,
  reason: string,
  requestId?: string
): void {
  const entry = createAuditEntry('auth_failure', request, {
    requestId,
    data: { reason },
  });

  logger.warn('AUDIT: Authentication failed', { ...entry });
}

/**
 * Log invalid token
 */
export function logInvalidToken(
  request: Request,
  requestId?: string
): void {
  const entry = createAuditEntry('auth_token_invalid', request, {
    requestId,
  });

  logger.warn('AUDIT: Invalid authentication token', { ...entry });
}

/**
 * Log expired session
 */
export function logSessionExpired(
  request: Request,
  userId?: string,
  requestId?: string
): void {
  const entry = createAuditEntry('auth_session_expired', request, {
    requestId,
    userId,
  });

  logger.info('AUDIT: Session expired', { ...entry });
}

/**
 * Log rate limit exceeded
 */
export function logRateLimitExceeded(
  request: Request,
  identifier: string,
  current: number,
  limit: number,
  requestId?: string
): void {
  const entry = createAuditEntry('rate_limit_exceeded', request, {
    requestId,
    data: {
      identifier: identifier.substring(0, 20) + '...',
      current,
      limit,
    },
  });

  logger.warn('AUDIT: Rate limit exceeded', { ...entry });
}

/**
 * Log query execution
 */
export function logQueryExecuted(
  request: Request,
  queryType: 'read' | 'write',
  queryPreview: string,
  executionTimeMs: number,
  userId?: string,
  requestId?: string
): void {
  const entry = createAuditEntry('query_executed', request, {
    requestId,
    userId,
    data: {
      queryType,
      queryPreview: queryPreview.substring(0, 100),
      executionTimeMs,
    },
  });

  logger.info('AUDIT: Query executed', { ...entry });
}

/**
 * Log blocked query
 */
export function logQueryBlocked(
  request: Request,
  reason: string,
  queryPreview: string,
  userId?: string,
  requestId?: string
): void {
  const entry = createAuditEntry('query_blocked', request, {
    requestId,
    userId,
    data: {
      reason,
      queryPreview: queryPreview.substring(0, 100),
    },
  });

  logger.warn('AUDIT: Query blocked', { ...entry });
}

/**
 * Log setup attempt
 */
export function logSetupAttempt(
  request: Request,
  neo4jUri: string,
  requestId?: string
): void {
  // Only log domain, not full URI
  const uriDomain = extractDomain(neo4jUri);

  const entry = createAuditEntry('setup_attempt', request, {
    requestId,
    data: {
      neo4jDomain: uriDomain,
    },
  });

  logger.info('AUDIT: Setup attempt', { ...entry });
}

/**
 * Log setup success
 */
export function logSetupSuccess(
  request: Request,
  userId: string,
  connectionId: string,
  requestId?: string
): void {
  const entry = createAuditEntry('setup_success', request, {
    requestId,
    userId,
    data: {
      connectionId,
    },
  });

  logger.info('AUDIT: Setup successful', { ...entry });
}

/**
 * Log setup failure
 */
export function logSetupFailure(
  request: Request,
  reason: string,
  requestId?: string
): void {
  const entry = createAuditEntry('setup_failure', request, {
    requestId,
    data: {
      reason,
    },
  });

  logger.warn('AUDIT: Setup failed', { ...entry });
}

/**
 * Log suspicious activity
 */
export function logSuspiciousActivity(
  request: Request,
  reason: string,
  details?: Record<string, unknown>,
  requestId?: string
): void {
  const entry = createAuditEntry('suspicious_activity', request, {
    requestId,
    data: {
      reason,
      ...details,
    },
  });

  logger.warn('AUDIT: Suspicious activity detected', { ...entry });
}

/**
 * Extract domain from URI (for safe logging)
 */
function extractDomain(uri: string): string {
  try {
    // Handle neo4j+s:// and similar schemes
    const normalized = uri.replace(/^(neo4j\+s|neo4j\+ssc|neo4j|bolt\+s|bolt):\/\//, 'https://');
    const url = new URL(normalized);
    return url.hostname;
  } catch {
    return 'invalid-uri';
  }
}

/**
 * Log token creation
 */
export function logTokenCreated(
  request: Request,
  userId: string,
  connectionId: string,
  tokenPreview: string,
  requestId?: string
): void {
  const entry = createAuditEntry('token_created', request, {
    requestId,
    userId,
    data: {
      connectionId,
      tokenPreview,
      permanent: true,
    },
  });

  logger.info('AUDIT: Permanent token created', { ...entry });
}

/**
 * Log token revocation
 */
export function logTokenRevoked(
  request: Request,
  userId: string,
  tokenPreview: string,
  requestId?: string
): void {
  const entry = createAuditEntry('token_revoked', request, {
    requestId,
    userId,
    data: {
      tokenPreview,
    },
  });

  logger.info('AUDIT: Token revoked', { ...entry });
}

/**
 * Log token list access
 */
export function logTokenListAccessed(
  request: Request,
  userId: string,
  tokenCount: number,
  requestId?: string
): void {
  const entry = createAuditEntry('token_list_accessed', request, {
    requestId,
    userId,
    data: {
      tokenCount,
    },
  });

  logger.info('AUDIT: Token list accessed', { ...entry });
}

/**
 * Log failed token revocation attempt
 */
export function logTokenRevokeAttemptFailed(
  request: Request,
  userId: string,
  reason: string,
  requestId?: string
): void {
  const entry = createAuditEntry('token_revoke_attempt', request, {
    requestId,
    userId,
    data: {
      reason,
      success: false,
    },
  });

  logger.warn('AUDIT: Token revocation attempt failed', { ...entry });
}

/**
 * Mask sensitive data for logging
 */
export function maskSensitive(value: string, visibleChars: number = 4): string {
  if (value.length <= visibleChars) {
    return '*'.repeat(value.length);
  }
  return value.substring(0, visibleChars) + '*'.repeat(Math.min(value.length - visibleChars, 10));
}
