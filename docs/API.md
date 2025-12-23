# API Reference

Complete reference for the MCP Neo4j Cypher Server endpoints and tools.

## HTTP Endpoints

### Health Check

Check if the server is running.

```http
GET /health
```

**Response**
```json
{
  "status": "ok",
  "server": "mcp-neo4j-cypher",
  "version": "1.0.0",
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

---

### Setup Page

Web interface for configuring Neo4j connections.

```http
GET /setup
```

**Response**: HTML page with connection form.

---

### Setup API

Programmatically configure Neo4j connections.

#### Create Connection

```http
POST /api/setup
Content-Type: application/json

{
  "neo4jUri": "neo4j+s://xxxxx.databases.neo4j.io",
  "neo4jUser": "neo4j",
  "neo4jPassword": "your-password",
  "neo4jDatabase": "neo4j",
  "readOnly": false
}
```

**Response (Success)**
```json
{
  "success": true,
  "message": "Connection configured successfully",
  "token": "your-session-token",
  "expiresIn": 86400
}
```

**Response (Error)**
```json
{
  "success": false,
  "error": "Connection failed",
  "message": "Authentication failed. Check your Neo4j credentials."
}
```

#### Check Connection Status

```http
GET /api/setup
Authorization: Bearer <token>
```

**Response (Authenticated)**
```json
{
  "authenticated": true,
  "userId": "user-123",
  "connectionId": "conn-456",
  "database": "neo4j",
  "readOnly": false
}
```

**Response (Not Authenticated)**
```json
{
  "authenticated": false
}
```

---

### MCP Endpoint

JSON-RPC 2.0 endpoint for MCP protocol.

```http
POST /mcp
Content-Type: application/json
Authorization: Bearer <token>
```

## MCP Protocol

The server implements the [Model Context Protocol](https://modelcontextprotocol.io/) specification version `2024-11-05`.

### Initialize

Handshake to establish connection and exchange capabilities.

**Request**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "clientInfo": {
      "name": "claude",
      "version": "1.0.0"
    }
  }
}
```

**Response**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2024-11-05",
    "serverInfo": {
      "name": "mcp-neo4j-cypher",
      "version": "1.0.0"
    },
    "capabilities": {
      "tools": {}
    }
  }
}
```

---

### List Tools

Get available tools.

**Request**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list"
}
```

**Response**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "tools": [
      {
        "name": "get_neo4j_schema",
        "description": "Retrieve the schema of the Neo4j database...",
        "inputSchema": { ... }
      },
      {
        "name": "read_neo4j_cypher",
        "description": "Execute a read-only Cypher query...",
        "inputSchema": { ... }
      },
      {
        "name": "write_neo4j_cypher",
        "description": "Execute a write Cypher query...",
        "inputSchema": { ... }
      }
    ]
  }
}
```

**Note**: `write_neo4j_cypher` is hidden when connection is read-only.

---

### Call Tool

Execute a tool.

**Request**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "tool_name",
    "arguments": { ... }
  }
}
```

**Response**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "..."
      }
    ]
  }
}
```

---

## MCP Tools

### get_neo4j_schema

Retrieves the database schema including node labels, relationship types, and properties.

**Parameters**

| Name | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `sample_size` | integer | No | 1000 | Number of nodes to sample for schema inference |

**Request**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "get_neo4j_schema",
    "arguments": {
      "sample_size": 500
    }
  }
}
```

**Response**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "# Neo4j Database Schema\n\n## Node Labels\n\n### Person\n- name: STRING\n- age: INTEGER\n- email: STRING (indexed)\n\n### Movie\n- title: STRING (indexed)\n- released: INTEGER\n- tagline: STRING\n\n## Relationships\n\n### ACTED_IN\n- From: Person\n- To: Movie\n- Properties: roles (LIST)\n\n### DIRECTED\n- From: Person\n- To: Movie\n\n## Statistics\n- Total nodes: 171\n- Total relationships: 253"
      }
    ]
  }
}
```

**Notes**
- Schema is cached for 5 minutes
- Uses APOC `meta.schema` if available, falls back to manual extraction
- Large schemas may be truncated based on token limit

---

### read_neo4j_cypher

Executes read-only Cypher queries (MATCH, RETURN, etc.).

**Parameters**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `query` | string | Yes | Cypher query to execute |
| `params` | object | No | Query parameters |

**Request**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "read_neo4j_cypher",
    "arguments": {
      "query": "MATCH (p:Person)-[:ACTED_IN]->(m:Movie) WHERE m.title = $title RETURN p.name AS actor",
      "params": {
        "title": "The Matrix"
      }
    }
  }
}
```

**Response**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\n  \"columns\": [\"actor\"],\n  \"rowCount\": 5,\n  \"rows\": [\n    {\"actor\": \"Keanu Reeves\"},\n    {\"actor\": \"Carrie-Anne Moss\"},\n    {\"actor\": \"Laurence Fishburne\"},\n    {\"actor\": \"Hugo Weaving\"},\n    {\"actor\": \"Emil Eifrem\"}\n  ]\n}"
      }
    ]
  }
}
```

**Error Response (Write Query Attempted)**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "error": {
    "code": -32602,
    "message": "This query contains write operations. Use write_neo4j_cypher for CREATE, MERGE, DELETE, SET, or REMOVE operations."
  }
}
```

**Notes**
- Rejects queries containing CREATE, MERGE, DELETE, SET, REMOVE
- Results are sanitized (embeddings removed, long lists truncated)
- Default timeout: 30 seconds

---

### write_neo4j_cypher

Executes write Cypher queries (CREATE, MERGE, DELETE, SET, REMOVE).

**Parameters**

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `query` | string | Yes | Cypher query to execute |
| `params` | object | No | Query parameters |

**Request**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "write_neo4j_cypher",
    "arguments": {
      "query": "CREATE (p:Person {name: $name, age: $age}) RETURN p",
      "params": {
        "name": "Alice",
        "age": 30
      }
    }
  }
}
```

**Response**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\n  \"success\": true,\n  \"summary\": \"Created 1 node, set 2 properties\",\n  \"counters\": {\n    \"nodesCreated\": 1,\n    \"propertiesSet\": 2,\n    \"relationshipsCreated\": 0,\n    \"nodesDeleted\": 0,\n    \"relationshipsDeleted\": 0\n  }\n}"
      }
    ]
  }
}
```

**Error Response (Read-Only Mode)**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\n  \"error\": \"Write operations disabled\",\n  \"message\": \"This connection is configured as read-only. Write operations are not permitted.\"\n}"
      }
    ],
    "isError": true
  }
}
```

**Notes**
- Not available when connection is read-only
- Blocked queries: DROP DATABASE, CREATE USER, GRANT, etc.
- Returns operation counters on success

---

## Error Codes

Standard JSON-RPC 2.0 error codes:

| Code | Name | Description |
|------|------|-------------|
| -32700 | Parse Error | Invalid JSON |
| -32600 | Invalid Request | Not a valid JSON-RPC request |
| -32601 | Method Not Found | Unknown method |
| -32602 | Invalid Params | Invalid parameters |
| -32603 | Internal Error | Server error |

Custom error codes:

| Code | Name | Description |
|------|------|-------------|
| -32001 | Validation Error | Query validation failed |
| -32002 | Neo4j Error | Neo4j query execution failed |

---

## Query Examples

### Read Queries

```cypher
-- Get all nodes of a label
MATCH (n:Person) RETURN n LIMIT 10

-- Find relationships
MATCH (a:Person)-[r:KNOWS]->(b:Person)
RETURN a.name, b.name, r.since

-- Aggregate data
MATCH (p:Person)-[:ACTED_IN]->(m:Movie)
RETURN p.name, count(m) AS movies
ORDER BY movies DESC LIMIT 5

-- Pattern matching
MATCH path = (a:Person {name: 'Tom Hanks'})-[:ACTED_IN*1..3]-(b:Person)
RETURN path LIMIT 10

-- Full-text search (if index exists)
CALL db.index.fulltext.queryNodes('personNames', 'Tom')
YIELD node, score
RETURN node.name, score
```

### Write Queries

```cypher
-- Create a node
CREATE (p:Person {name: 'Alice', born: 1990})
RETURN p

-- Create a relationship
MATCH (a:Person {name: 'Alice'}), (b:Person {name: 'Bob'})
CREATE (a)-[:KNOWS {since: 2020}]->(b)

-- Update properties
MATCH (p:Person {name: 'Alice'})
SET p.email = 'alice@example.com'
RETURN p

-- Merge (create if not exists)
MERGE (p:Person {name: 'Charlie'})
ON CREATE SET p.created = datetime()
ON MATCH SET p.lastSeen = datetime()
RETURN p

-- Delete nodes
MATCH (p:Person {name: 'Alice'})
DETACH DELETE p
```

### Parameterized Queries

Always use parameters for user-provided values:

```javascript
// Good - parameterized
{
  "query": "MATCH (p:Person {name: $name}) RETURN p",
  "params": { "name": "Alice" }
}

// Bad - string interpolation (security risk)
{
  "query": "MATCH (p:Person {name: 'Alice'}) RETURN p"
}
```
