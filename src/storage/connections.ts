/**
 * Connection Storage
 *
 * CRUD operations for Neo4j connections in D1 database.
 * Handles encryption/decryption of credentials.
 */

import type { Neo4jConnection, Neo4jConnectionRecord, Result } from '../types.js';
import { encryptToString, decryptFromString, generateUrlSafeToken } from '../auth/crypto.js';
import * as logger from '../utils/logger.js';

/**
 * Connection creation data (plaintext)
 */
export interface CreateConnectionData {
  userId: string;
  name?: string;
  uri: string;
  username: string;
  password: string;
  database?: string;
  readOnly?: boolean;
}

/**
 * Connection update data (plaintext, all fields optional)
 */
export interface UpdateConnectionData {
  name?: string;
  uri?: string;
  username?: string;
  password?: string;
  database?: string;
  readOnly?: boolean;
  isActive?: boolean;
}

/**
 * Decrypted connection with metadata
 */
export interface DecryptedConnection {
  connection: Neo4jConnection;
  readOnly: boolean;
  name: string;
  isActive: boolean;
}

/**
 * Generate a unique connection ID
 *
 * @returns Unique connection ID
 */
function generateConnectionId(): string {
  return `conn_${generateUrlSafeToken(16)}`;
}

/**
 * Create a new connection
 *
 * Encrypts credentials before storing.
 *
 * @param db - D1 database binding
 * @param data - Connection data (plaintext)
 * @param encryptionKey - Encryption key
 * @returns Result with connection ID
 */
export async function createConnection(
  db: D1Database,
  data: CreateConnectionData,
  encryptionKey: string
): Promise<Result<string>> {
  const id = generateConnectionId();

  try {
    // Encrypt credentials
    const [encryptedUri, encryptedUser, encryptedPassword] = await Promise.all([
      encryptToString(data.uri, encryptionKey),
      encryptToString(data.username, encryptionKey),
      encryptToString(data.password, encryptionKey),
    ]);

    await db
      .prepare(
        `INSERT INTO connections
         (id, user_id, name, neo4j_uri_encrypted, neo4j_user_encrypted,
          neo4j_password_encrypted, neo4j_database, read_only, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`
      )
      .bind(
        id,
        data.userId,
        data.name ?? 'default',
        encryptedUri,
        encryptedUser,
        encryptedPassword,
        data.database ?? 'neo4j',
        data.readOnly ? 1 : 0
      )
      .run();

    logger.info('Connection created', {
      connectionId: id,
      userId: data.userId,
      name: data.name ?? 'default',
    });

    return { success: true, data: id };
  } catch (error) {
    logger.error('Failed to create connection', {
      userId: data.userId,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/**
 * Get a connection by ID (decrypted)
 *
 * @param db - D1 database binding
 * @param id - Connection ID
 * @param encryptionKey - Encryption key
 * @returns Result with decrypted connection or null
 */
export async function getConnectionById(
  db: D1Database,
  id: string,
  encryptionKey: string
): Promise<Result<DecryptedConnection | null>> {
  try {
    const record = await db
      .prepare('SELECT * FROM connections WHERE id = ?')
      .bind(id)
      .first<Neo4jConnectionRecord>();

    if (!record) {
      return { success: true, data: null };
    }

    // Decrypt credentials
    const [uri, username, password] = await Promise.all([
      decryptFromString(record.neo4j_uri_encrypted, encryptionKey),
      decryptFromString(record.neo4j_user_encrypted, encryptionKey),
      decryptFromString(record.neo4j_password_encrypted, encryptionKey),
    ]);

    return {
      success: true,
      data: {
        connection: {
          uri,
          username,
          password,
          database: record.neo4j_database,
        },
        readOnly: record.read_only === 1,
        name: record.name,
        isActive: record.is_active === 1,
      },
    };
  } catch (error) {
    logger.error('Failed to get connection', {
      connectionId: id,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/**
 * Get all connections for a user (metadata only, not decrypted)
 *
 * @param db - D1 database binding
 * @param userId - User ID
 * @returns Result with connection records (encrypted)
 */
export async function getConnectionsByUserId(
  db: D1Database,
  userId: string
): Promise<Result<Neo4jConnectionRecord[]>> {
  try {
    const result = await db
      .prepare('SELECT * FROM connections WHERE user_id = ? ORDER BY created_at DESC')
      .bind(userId)
      .all<Neo4jConnectionRecord>();

    return { success: true, data: result.results };
  } catch (error) {
    logger.error('Failed to get connections for user', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/**
 * Get the active connection for a user (decrypted)
 *
 * @param db - D1 database binding
 * @param userId - User ID
 * @param encryptionKey - Encryption key
 * @returns Result with decrypted connection or null
 */
export async function getActiveConnectionForUser(
  db: D1Database,
  userId: string,
  encryptionKey: string
): Promise<Result<{ id: string; connection: DecryptedConnection } | null>> {
  try {
    const record = await db
      .prepare('SELECT * FROM connections WHERE user_id = ? AND is_active = 1 LIMIT 1')
      .bind(userId)
      .first<Neo4jConnectionRecord>();

    if (!record) {
      return { success: true, data: null };
    }

    // Decrypt credentials
    const [uri, username, password] = await Promise.all([
      decryptFromString(record.neo4j_uri_encrypted, encryptionKey),
      decryptFromString(record.neo4j_user_encrypted, encryptionKey),
      decryptFromString(record.neo4j_password_encrypted, encryptionKey),
    ]);

    return {
      success: true,
      data: {
        id: record.id,
        connection: {
          connection: {
            uri,
            username,
            password,
            database: record.neo4j_database,
          },
          readOnly: record.read_only === 1,
          name: record.name,
          isActive: true,
        },
      },
    };
  } catch (error) {
    logger.error('Failed to get active connection', {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/**
 * Update a connection
 *
 * @param db - D1 database binding
 * @param id - Connection ID
 * @param data - Update data
 * @param encryptionKey - Encryption key (required if updating credentials)
 * @returns Result indicating success
 */
export async function updateConnection(
  db: D1Database,
  id: string,
  data: UpdateConnectionData,
  encryptionKey: string
): Promise<Result<void>> {
  try {
    const updates: string[] = [];
    const values: (string | number)[] = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      values.push(data.name);
    }

    if (data.uri !== undefined) {
      updates.push('neo4j_uri_encrypted = ?');
      values.push(await encryptToString(data.uri, encryptionKey));
    }

    if (data.username !== undefined) {
      updates.push('neo4j_user_encrypted = ?');
      values.push(await encryptToString(data.username, encryptionKey));
    }

    if (data.password !== undefined) {
      updates.push('neo4j_password_encrypted = ?');
      values.push(await encryptToString(data.password, encryptionKey));
    }

    if (data.database !== undefined) {
      updates.push('neo4j_database = ?');
      values.push(data.database);
    }

    if (data.readOnly !== undefined) {
      updates.push('read_only = ?');
      values.push(data.readOnly ? 1 : 0);
    }

    if (data.isActive !== undefined) {
      updates.push('is_active = ?');
      values.push(data.isActive ? 1 : 0);
    }

    if (updates.length === 0) {
      return { success: true, data: undefined };
    }

    values.push(id);

    const result = await db
      .prepare(`UPDATE connections SET ${updates.join(', ')} WHERE id = ?`)
      .bind(...values)
      .run();

    if (result.meta.changes === 0) {
      return { success: false, error: new Error('Connection not found') };
    }

    logger.info('Connection updated', { connectionId: id });

    return { success: true, data: undefined };
  } catch (error) {
    logger.error('Failed to update connection', {
      connectionId: id,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/**
 * Set a connection as active (and deactivate others for the user)
 *
 * @param db - D1 database binding
 * @param id - Connection ID to activate
 * @param userId - User ID (for validation and deactivating others)
 * @returns Result indicating success
 */
export async function setActiveConnection(
  db: D1Database,
  id: string,
  userId: string
): Promise<Result<void>> {
  try {
    // Deactivate all connections for this user
    await db
      .prepare('UPDATE connections SET is_active = 0 WHERE user_id = ?')
      .bind(userId)
      .run();

    // Activate the specified connection
    const result = await db
      .prepare('UPDATE connections SET is_active = 1 WHERE id = ? AND user_id = ?')
      .bind(id, userId)
      .run();

    if (result.meta.changes === 0) {
      return { success: false, error: new Error('Connection not found or not owned by user') };
    }

    logger.info('Active connection changed', { connectionId: id, userId });

    return { success: true, data: undefined };
  } catch (error) {
    logger.error('Failed to set active connection', {
      connectionId: id,
      userId,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/**
 * Delete a connection
 *
 * @param db - D1 database binding
 * @param id - Connection ID
 * @returns Result indicating success
 */
export async function deleteConnection(
  db: D1Database,
  id: string
): Promise<Result<void>> {
  try {
    const result = await db
      .prepare('DELETE FROM connections WHERE id = ?')
      .bind(id)
      .run();

    if (result.meta.changes === 0) {
      return { success: false, error: new Error('Connection not found') };
    }

    logger.info('Connection deleted', { connectionId: id });

    return { success: true, data: undefined };
  } catch (error) {
    logger.error('Failed to delete connection', {
      connectionId: id,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/**
 * Count connections for a user
 *
 * @param db - D1 database binding
 * @param userId - User ID
 * @returns Connection count
 */
export async function countUserConnections(
  db: D1Database,
  userId: string
): Promise<number> {
  try {
    const result = await db
      .prepare('SELECT COUNT(*) as count FROM connections WHERE user_id = ?')
      .bind(userId)
      .first<{ count: number }>();

    return result?.count ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Validate that a connection belongs to a user
 *
 * @param db - D1 database binding
 * @param connectionId - Connection ID
 * @param userId - User ID
 * @returns true if connection belongs to user
 */
export async function connectionBelongsToUser(
  db: D1Database,
  connectionId: string,
  userId: string
): Promise<boolean> {
  try {
    const result = await db
      .prepare('SELECT 1 FROM connections WHERE id = ? AND user_id = ?')
      .bind(connectionId, userId)
      .first();

    return result !== null;
  } catch {
    return false;
  }
}

/**
 * Get connection metadata without decrypting (for listing)
 *
 * @param record - Encrypted connection record
 * @returns Metadata without sensitive data
 */
export function getConnectionMetadata(record: Neo4jConnectionRecord): {
  id: string;
  name: string;
  database: string;
  readOnly: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
} {
  return {
    id: record.id,
    name: record.name,
    database: record.neo4j_database,
    readOnly: record.read_only === 1,
    isActive: record.is_active === 1,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}
