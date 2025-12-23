/**
 * User Storage
 *
 * CRUD operations for users in D1 database.
 */

import type { UserRecord, Result } from '../types.js';
import { generateUrlSafeToken } from '../auth/crypto.js';
import * as logger from '../utils/logger.js';

/**
 * User creation data
 */
export interface CreateUserData {
  email?: string;
}

/**
 * Generate a unique user ID
 *
 * @returns Unique user ID
 */
function generateUserId(): string {
  return `usr_${generateUrlSafeToken(16)}`;
}

/**
 * Create a new user
 *
 * @param db - D1 database binding
 * @param data - User creation data
 * @returns Result with created user
 */
export async function createUser(
  db: D1Database,
  data: CreateUserData = {}
): Promise<Result<UserRecord>> {
  const id = generateUserId();

  try {
    await db
      .prepare(
        `INSERT INTO users (id, email) VALUES (?, ?)`
      )
      .bind(id, data.email ?? null)
      .run();

    const user = await getUserById(db, id);

    if (!user.success || !user.data) {
      return { success: false, error: new Error('Failed to retrieve created user') };
    }

    logger.info('User created', { userId: id, email: data.email });

    return { success: true, data: user.data };
  } catch (error) {
    logger.error('Failed to create user', {
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/**
 * Get a user by ID
 *
 * @param db - D1 database binding
 * @param id - User ID
 * @returns Result with user or null if not found
 */
export async function getUserById(
  db: D1Database,
  id: string
): Promise<Result<UserRecord | null>> {
  try {
    const user = await db
      .prepare('SELECT * FROM users WHERE id = ?')
      .bind(id)
      .first<UserRecord>();

    return { success: true, data: user };
  } catch (error) {
    logger.error('Failed to get user by ID', {
      userId: id,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/**
 * Get a user by email
 *
 * @param db - D1 database binding
 * @param email - User email
 * @returns Result with user or null if not found
 */
export async function getUserByEmail(
  db: D1Database,
  email: string
): Promise<Result<UserRecord | null>> {
  try {
    const user = await db
      .prepare('SELECT * FROM users WHERE email = ?')
      .bind(email)
      .first<UserRecord>();

    return { success: true, data: user };
  } catch (error) {
    logger.error('Failed to get user by email', {
      email,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/**
 * Get or create a user by email
 *
 * If a user with the given email exists, returns it.
 * Otherwise, creates a new user.
 *
 * @param db - D1 database binding
 * @param email - User email
 * @returns Result with user (existing or new)
 */
export async function getOrCreateUserByEmail(
  db: D1Database,
  email: string
): Promise<Result<UserRecord>> {
  // Try to find existing user
  const existing = await getUserByEmail(db, email);

  if (!existing.success) {
    return existing as Result<UserRecord>;
  }

  if (existing.data) {
    return { success: true, data: existing.data };
  }

  // Create new user
  return createUser(db, { email });
}

/**
 * Update a user's email
 *
 * @param db - D1 database binding
 * @param id - User ID
 * @param email - New email
 * @returns Result indicating success
 */
export async function updateUserEmail(
  db: D1Database,
  id: string,
  email: string
): Promise<Result<void>> {
  try {
    const result = await db
      .prepare('UPDATE users SET email = ? WHERE id = ?')
      .bind(email, id)
      .run();

    if (result.meta.changes === 0) {
      return { success: false, error: new Error('User not found') };
    }

    logger.info('User email updated', { userId: id });

    return { success: true, data: undefined };
  } catch (error) {
    logger.error('Failed to update user email', {
      userId: id,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/**
 * Delete a user
 *
 * Note: This will cascade delete all connections due to foreign key.
 *
 * @param db - D1 database binding
 * @param id - User ID
 * @returns Result indicating success
 */
export async function deleteUser(
  db: D1Database,
  id: string
): Promise<Result<void>> {
  try {
    const result = await db
      .prepare('DELETE FROM users WHERE id = ?')
      .bind(id)
      .run();

    if (result.meta.changes === 0) {
      return { success: false, error: new Error('User not found') };
    }

    logger.info('User deleted', { userId: id });

    return { success: true, data: undefined };
  } catch (error) {
    logger.error('Failed to delete user', {
      userId: id,
      error: error instanceof Error ? error.message : String(error),
    });

    return {
      success: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

/**
 * Check if a user exists
 *
 * @param db - D1 database binding
 * @param id - User ID
 * @returns true if user exists
 */
export async function userExists(
  db: D1Database,
  id: string
): Promise<boolean> {
  try {
    const result = await db
      .prepare('SELECT 1 FROM users WHERE id = ?')
      .bind(id)
      .first();

    return result !== null;
  } catch {
    return false;
  }
}

/**
 * Count total users
 *
 * @param db - D1 database binding
 * @returns Total user count
 */
export async function countUsers(db: D1Database): Promise<number> {
  try {
    const result = await db
      .prepare('SELECT COUNT(*) as count FROM users')
      .first<{ count: number }>();

    return result?.count ?? 0;
  } catch {
    return 0;
  }
}
