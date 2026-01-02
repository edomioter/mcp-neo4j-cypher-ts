/**
 * Setup API Handler
 *
 * Handles the setup flow for configuring Neo4j connections.
 */

import type { Env } from '../types.js';
import { HTTP_STATUS, CONTENT_TYPES } from '../config/constants.js';
import { createNeo4jClient } from '../neo4j/client.js';
import { createUser } from '../storage/users.js';
import { createConnection } from '../storage/connections.js';
import { createSession } from '../auth/session.js';
import * as logger from '../utils/logger.js';
import * as audit from '../security/audit.js';

/**
 * Setup request body
 */
export interface SetupRequest {
  uri: string;
  username: string;
  password: string;
  database?: string;
  readOnly?: boolean;
  email?: string;
}

/**
 * Setup response
 */
export interface SetupResponse {
  success: boolean;
  token?: string;
  message?: string;
  connectionId?: string;
}

/**
 * Validate setup request body
 */
function validateSetupRequest(body: unknown): SetupRequest {
  if (!body || typeof body !== 'object') {
    throw new Error('Invalid request body');
  }

  const data = body as Record<string, unknown>;

  if (!data.uri || typeof data.uri !== 'string') {
    throw new Error('Neo4j URI is required');
  }

  if (!data.username || typeof data.username !== 'string') {
    throw new Error('Username is required');
  }

  if (!data.password || typeof data.password !== 'string') {
    throw new Error('Password is required');
  }

  // Validate URI format
  const uri = data.uri.trim();
  if (!isValidNeo4jUri(uri)) {
    throw new Error('Invalid Neo4j URI format. Expected: neo4j+s://xxx.databases.neo4j.io');
  }

  return {
    uri,
    username: data.username.trim(),
    password: data.password,
    database: typeof data.database === 'string' ? data.database.trim() || 'neo4j' : 'neo4j',
    readOnly: data.readOnly === true,
    email: typeof data.email === 'string' ? data.email.trim() : undefined,
  };
}

/**
 * Check if a URI is a valid Neo4j URI
 */
function isValidNeo4jUri(uri: string): boolean {
  const validPrefixes = [
    'neo4j+s://',
    'neo4j+ssc://',
    'neo4j://',
    'bolt+s://',
    'bolt://',
    'https://',
    'http://',
  ];

  return validPrefixes.some(prefix => uri.startsWith(prefix));
}

/**
 * Test Neo4j connection with provided credentials
 */
async function testNeo4jConnection(
  uri: string,
  username: string,
  password: string,
  database: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const client = createNeo4jClient({
      uri,
      username,
      password,
      database,
    }, {
      defaultTimeout: 15, // Short timeout for testing
    });

    const connected = await client.testConnection();

    if (!connected) {
      return {
        success: false,
        error: 'Could not connect to Neo4j. Please check your credentials.',
      };
    }

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Connection failed';
    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Handle POST /api/setup
 *
 * Creates a new user, connection, and session.
 */
export async function handleSetupPost(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    // Parse request body
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return createErrorResponse('Invalid JSON in request body', HTTP_STATUS.BAD_REQUEST);
    }

    // Validate request
    let setupData: SetupRequest;
    try {
      setupData = validateSetupRequest(body);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Validation failed';
      return createErrorResponse(message, HTTP_STATUS.BAD_REQUEST);
    }

    logger.info('Setup request received', {
      uri: setupData.uri.substring(0, 30) + '...',
      username: setupData.username,
      database: setupData.database,
      readOnly: setupData.readOnly,
    });

    // Test connection to Neo4j
    const testResult = await testNeo4jConnection(
      setupData.uri,
      setupData.username,
      setupData.password,
      setupData.database ?? 'neo4j'
    );

    if (!testResult.success) {
      logger.warn('Neo4j connection test failed', { error: testResult.error });
      return createErrorResponse(
        testResult.error ?? 'Could not connect to Neo4j',
        HTTP_STATUS.BAD_REQUEST
      );
    }

    logger.info('Neo4j connection test successful');

    // Create user
    const userResult = await createUser(env.DB, {
      email: setupData.email,
    });

    if (!userResult.success) {
      logger.error('Failed to create user', { error: userResult.error?.message });
      return createErrorResponse('Failed to create user account', HTTP_STATUS.INTERNAL_ERROR);
    }

    const userId = userResult.data.id;
    logger.info('User created', { userId });

    // Create connection (encrypted)
    const connectionResult = await createConnection(
      env.DB,
      {
        userId,
        uri: setupData.uri,
        username: setupData.username,
        password: setupData.password,
        database: setupData.database,
        readOnly: setupData.readOnly,
      },
      env.ENCRYPTION_KEY
    );

    if (!connectionResult.success) {
      logger.error('Failed to create connection', { error: connectionResult.error?.message });
      return createErrorResponse('Failed to save connection', HTTP_STATUS.INTERNAL_ERROR);
    }

    const connectionId = connectionResult.data;
    logger.info('Connection created', { connectionId });

    // Create session
    const token = await createSession(env.SESSIONS, userId, connectionId);
    logger.info('Session created', { userId, connectionId });

    // Audit log: Permanent token created
    audit.logTokenCreated(
      request,
      userId,
      connectionId,
      audit.maskSensitive(token, 8)
    );

    // Return success response
    const response: SetupResponse = {
      success: true,
      token,
      connectionId,
      message: 'Connection configured successfully',
    };

    return new Response(JSON.stringify(response), {
      status: HTTP_STATUS.OK,
      headers: {
        'Content-Type': CONTENT_TYPES.JSON,
      },
    });

  } catch (error) {
    logger.error('Setup failed', {
      error: error instanceof Error ? error.message : String(error),
    });

    return createErrorResponse(
      'An unexpected error occurred during setup',
      HTTP_STATUS.INTERNAL_ERROR
    );
  }
}

/**
 * Create an error response
 */
function createErrorResponse(message: string, status: number): Response {
  return new Response(
    JSON.stringify({
      success: false,
      message,
    }),
    {
      status,
      headers: {
        'Content-Type': CONTENT_TYPES.JSON,
      },
    }
  );
}

/**
 * Handle connection status check
 *
 * Checks if a session token is valid and returns connection info.
 */
export async function handleConnectionStatus(
  request: Request,
  env: Env
): Promise<Response> {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader) {
    return new Response(
      JSON.stringify({
        connected: false,
        message: 'No authentication token provided',
      }),
      {
        status: HTTP_STATUS.OK,
        headers: { 'Content-Type': CONTENT_TYPES.JSON },
      }
    );
  }

  // Extract token
  const token = authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : authHeader.trim();

  // Import session validation
  const { validateSession } = await import('../auth/session.js');
  const sessionResult = await validateSession(env.SESSIONS, token);

  if (!sessionResult.valid) {
    return new Response(
      JSON.stringify({
        connected: false,
        message: 'Invalid or expired session',
      }),
      {
        status: HTTP_STATUS.OK,
        headers: { 'Content-Type': CONTENT_TYPES.JSON },
      }
    );
  }

  return new Response(
    JSON.stringify({
      connected: true,
      userId: sessionResult.session?.userId,
      connectionId: sessionResult.session?.connectionId,
    }),
    {
      status: HTTP_STATUS.OK,
      headers: { 'Content-Type': CONTENT_TYPES.JSON },
    }
  );
}
