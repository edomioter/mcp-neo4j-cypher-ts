-- ============================================
-- MCP Neo4j Cypher Server - D1 Database Schema
-- ============================================

-- Users table
-- Stores registered users who can configure Neo4j connections
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Connections table
-- Stores Neo4j connection configurations per user
-- Credentials are encrypted using AES-GCM
CREATE TABLE IF NOT EXISTS connections (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT DEFAULT 'default',
    neo4j_uri_encrypted TEXT NOT NULL,
    neo4j_user_encrypted TEXT NOT NULL,
    neo4j_password_encrypted TEXT NOT NULL,
    neo4j_database TEXT DEFAULT 'neo4j',
    read_only INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Index for faster lookups by user_id
CREATE INDEX IF NOT EXISTS idx_connections_user_id ON connections(user_id);

-- Index for active connections lookup
CREATE INDEX IF NOT EXISTS idx_connections_active ON connections(user_id, is_active);

-- ============================================
-- Triggers for updated_at timestamps
-- ============================================

-- Trigger for users table
CREATE TRIGGER IF NOT EXISTS update_users_timestamp
AFTER UPDATE ON users
BEGIN
    UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- Trigger for connections table
CREATE TRIGGER IF NOT EXISTS update_connections_timestamp
AFTER UPDATE ON connections
BEGIN
    UPDATE connections SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
