# Security

This document describes the security measures implemented in the MCP Neo4j Cypher Server.

## Overview

The server implements multiple layers of security:

1. **Encryption** - AES-256-GCM for stored credentials
2. **Authentication** - Session tokens with expiration
3. **Rate Limiting** - Protection against abuse
4. **Query Validation** - Blocking dangerous operations
5. **Audit Logging** - Security event tracking

## Credential Encryption

### How It Works

Neo4j credentials are encrypted before storage using AES-256-GCM:

```
User Input → AES-256-GCM Encrypt → D1 Database
D1 Database → AES-256-GCM Decrypt → Neo4j Connection
```

### Technical Details

- **Algorithm**: AES-256-GCM (Galois/Counter Mode)
- **Key Derivation**: SHA-256 hash of `ENCRYPTION_KEY`
- **IV**: Unique 12-byte random value per encryption
- **Storage Format**: `base64(iv):base64(ciphertext)`

### Key Management

The `ENCRYPTION_KEY` secret should be:
- At least 32 characters
- Randomly generated
- Stored securely (Cloudflare Secrets)
- Never committed to version control

Generate a secure key:
```bash
openssl rand -base64 32
```

## Authentication

### Session Tokens

After configuring a Neo4j connection, users receive a session token:

- **Format**: URL-safe base64, 32 bytes
- **Storage**: Cloudflare KV with TTL
- **Expiration**: 24 hours (configurable)
- **Validation**: Double-check (KV TTL + stored timestamp)

### Token Usage

Include the token in requests:

```http
Authorization: Bearer <token>
```

Or:
```http
X-Session-Token: <token>
```

### Public vs Protected Methods

| Method | Authentication |
|--------|---------------|
| `initialize` | Not required |
| `notifications/initialized` | Not required |
| `tools/list` | Not required |
| `ping` | Not required |
| `tools/call` | **Required** |

## Rate Limiting

### Configuration

| Setting | Default | Description |
|---------|---------|-------------|
| `maxRequests` | 100 | Requests per window |
| `windowSeconds` | 60 | Window duration |

### Implementation

- **Algorithm**: Fixed window counter
- **Storage**: Cloudflare KV
- **Identifier Priority**:
  1. Authenticated user ID
  2. `CF-Connecting-IP` header
  3. `X-Forwarded-For` header
  4. Fallback to "anonymous"

### Response Headers

Rate limit information is included in responses:

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 45
```

### When Exceeded

Returns HTTP 429 with:

```json
{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Try again in 45 seconds.",
  "retryAfter": 45
}
```

## Query Validation

### Blocked Operations

The following Cypher operations are blocked for security:

| Operation | Reason |
|-----------|--------|
| `DROP DATABASE` | Destructive - could delete entire database |
| `CREATE DATABASE` | Administrative - could affect server resources |
| `CREATE USER` | Security - could create unauthorized access |
| `DROP USER` | Security - could lock out legitimate users |
| `GRANT` | Security - could escalate privileges |
| `REVOKE` | Security - could remove necessary permissions |
| `CALL dbms.*` | System - could access internal procedures |
| `LOAD CSV` (remote URLs) | Security - could access external resources |

### Examples of Blocked Queries

```cypher
-- Blocked: Database operations
DROP DATABASE mydb
CREATE DATABASE newdb

-- Blocked: User management
CREATE USER admin SET PASSWORD 'secret'
DROP USER someuser

-- Blocked: Permission management
GRANT ALL ON DATABASE neo4j TO admin
REVOKE READ ON DATABASE neo4j FROM user

-- Blocked: System procedures
CALL dbms.security.createUser('test', 'password')
CALL dbms.listConfig()

-- Blocked: Remote file access
LOAD CSV FROM 'https://evil.com/data.csv' AS row
```

### Allowed Operations

```cypher
-- Allowed: Normal read queries
MATCH (n:Person) RETURN n
MATCH (a)-[r]->(b) RETURN a, type(r), b

-- Allowed: Write queries (if not read-only)
CREATE (n:Person {name: 'Alice'})
MERGE (n:Person {id: 1})
MATCH (n) WHERE n.name = 'Bob' DELETE n

-- Allowed: Schema inspection
CALL db.labels()
CALL db.relationshipTypes()
CALL db.propertyKeys()
```

### Query Length Limit

Queries longer than 100KB are rejected to prevent abuse.

### Warnings

Non-blocking warnings are logged for:
- Queries without `LIMIT` clause (may return large results)
- Very complex queries (many clauses)

## Parameter Sanitization

Query parameters are validated:

- Keys must match pattern: `^[a-zA-Z_][a-zA-Z0-9_]*$`
- Invalid keys are silently filtered
- Values are passed through unchanged

Example:
```javascript
// Input
{ "valid_key": 1, "123invalid": 2, "also-invalid": 3 }

// Sanitized
{ "valid_key": 1 }
```

## Audit Logging

### Event Types

| Event | Description |
|-------|-------------|
| `auth_success` | Successful authentication |
| `auth_failure` | Failed authentication attempt |
| `auth_token_invalid` | Invalid token provided |
| `auth_session_expired` | Expired session used |
| `rate_limit_exceeded` | Rate limit hit |
| `query_executed` | Query successfully executed |
| `query_blocked` | Query blocked by validation |
| `setup_attempt` | Connection setup started |
| `setup_success` | Connection configured successfully |
| `setup_failure` | Connection setup failed |
| `suspicious_activity` | Potentially malicious behavior detected |

### Log Format

```json
{
  "event": "query_blocked",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "requestId": "abc-123",
  "userId": "user-456",
  "clientIp": "1.2.3.4",
  "userAgent": "Mozilla/5.0...",
  "data": {
    "reason": "DROP DATABASE is not allowed",
    "queryPreview": "DROP DATABASE mydb"
  }
}
```

### Sensitive Data Masking

- Passwords are never logged
- Neo4j URIs show only domain
- Query previews are truncated to 100 characters
- User identifiers are partially masked in some contexts

## CORS Configuration

### Default Settings

```
Access-Control-Allow-Origin: https://claude.ai
Access-Control-Allow-Methods: GET, POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, X-Session-Token
Access-Control-Max-Age: 86400
```

### Customization

Update `ALLOWED_ORIGINS` in `wrangler.toml`:

```toml
[vars]
ALLOWED_ORIGINS = "https://claude.ai,https://your-app.com"
```

Supports:
- Single origin: `https://claude.ai`
- Multiple origins: `https://a.com,https://b.com`
- Wildcard (not recommended): `*`

## Best Practices

### For Operators

1. **Rotate encryption keys periodically**
   - Generate new key
   - Re-encrypt existing credentials
   - Update Cloudflare secret

2. **Monitor audit logs**
   - Watch for repeated auth failures
   - Track rate limit events
   - Review blocked queries

3. **Restrict CORS origins**
   - Only allow trusted domains
   - Never use `*` in production

4. **Use read-only mode when possible**
   - Set `read_only: true` for connections that don't need writes
   - Limits potential damage from compromised accounts

### For Users

1. **Protect your session token**
   - Don't share tokens
   - Tokens expire after 24 hours
   - Request a new token if compromised

2. **Use Neo4j database users with minimal privileges**
   - Create a dedicated user for MCP access
   - Grant only necessary permissions
   - Don't use admin credentials

3. **Review queries before execution**
   - Claude shows queries before running
   - Verify they match your intent
   - Be cautious with write operations
