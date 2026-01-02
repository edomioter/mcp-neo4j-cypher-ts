# User Guide: Integrating MCP Neo4j Cypher Server with Claude.ai

This guide explains how to connect your Neo4j database to Claude.ai using the MCP Neo4j Cypher Server.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Step 1: Configure Your Neo4j Connection](#step-1-configure-your-neo4j-connection)
3. [Step 2: Add the MCP Server to Claude.ai](#step-2-add-the-mcp-server-to-claudeai)
4. [Step 3: Start Using Natural Language Queries](#step-3-start-using-natural-language-queries)
5. [Available Tools](#available-tools)
6. [Example Queries](#example-queries)
7. [Troubleshooting](#troubleshooting)
8. [Security Considerations](#security-considerations)

---

## Prerequisites

Before you begin, make sure you have:

- ✅ A **Neo4j database** (Neo4j Aura, self-hosted, or local)
- ✅ Your Neo4j **connection credentials** (URI, username, password)
- ✅ A **Claude.ai Pro or Team account** (MCP is available on paid plans)

### Supported Neo4j Versions

| Platform | Supported |
|----------|-----------|
| Neo4j Aura (Free, Pro, Enterprise) | ✅ |
| Neo4j Community Edition 4.x/5.x | ✅ |
| Neo4j Enterprise Edition 4.x/5.x | ✅ |
| Neo4j Desktop | ✅ |

---

## Step 1: Configure Your Neo4j Connection

### 1.1 Open the Setup Page

Navigate to the setup page in your browser:

```
https://mcp-neo4j-cypher.eduardodominguezotero.workers.dev/setup
```

### 1.2 Enter Your Neo4j Credentials

Fill in the connection form:

| Field | Description | Example |
|-------|-------------|---------|
| **Neo4j URI** | Your database connection string | `neo4j+s://abc123.databases.neo4j.io` |
| **Username** | Database username | `neo4j` |
| **Password** | Database password | `your-password` |
| **Database** | Database name (optional) | `neo4j` |
| **Read Only** | Check to disable write operations | ☐ |

#### Finding Your Neo4j URI

**Neo4j Aura:**
1. Go to [console.neo4j.io](https://console.neo4j.io)
2. Select your instance
3. Click "Connect" → Copy the connection URI
4. Format: `neo4j+s://xxxxxxxx.databases.neo4j.io`

**Self-hosted Neo4j:**
- Local: `bolt://localhost:7687` or `neo4j://localhost:7687`
- Remote: `neo4j+s://your-server.com:7687`

> ⚠️ **Important:** Before proceeding, make sure your Neo4j database is **running and accessible**. The setup process will test the connection, and if your database is offline or unreachable, the configuration will fail.

### 1.3 Test and Save

1. Click **"Test & Save Connection"**
2. Wait for the connection test (usually 2-5 seconds)
3. If successful, you'll see a **session token**

### 1.4 Copy Your Session Token

After successful connection, you'll receive:

```
✅ Connection successful!

Your session token:
┌────────────────────────────────────────────┐
│  abc123xyz789...                           │
└────────────────────────────────────────────┘

Use this token to configure Claude.ai
```

**Important:** Copy and save this token securely. You'll need it for the next step.

---

## Step 2: Add the MCP Server to Claude.ai

### 2.1 Build Your MCP Server URL

Once you have your session token, you need to create the complete MCP server URL by appending the token as a query parameter.

**URL Format:**
```
https://mcp-neo4j-cypher.eduardodominguezotero.workers.dev/mcp?token=YOUR_TOKEN_HERE
```

**Example:**
If your token is `KNdUaJFXdpBuTIXKozg0WFgtyMxdL0AeFpnd1wwxUMg`, your complete URL would be:
```
https://mcp-neo4j-cypher.eduardodominguezotero.workers.dev/mcp?token=KNdUaJFXdpBuTIXKozg0WFgtyMxdL0AeFpnd1wwxUMg
```

> 💡 **Tip:** The token is included in the URL because Claude.ai's MCP integration currently only accepts a server URL (no separate authentication field).

### 2.2 Open Claude.ai Settings

1. Go to [claude.ai](https://claude.ai)
2. Click on your profile icon (bottom-left)
3. Select **"Settings"**
4. Navigate to **"Integrations"** or **"MCP Servers"**

### 2.3 Add New MCP Server

Click **"Add MCP Server"** or **"Add Integration"** and enter:

| Setting | Value |
|---------|-------|
| **Name** | `Neo4j Database` (or any name you prefer) |
| **Server URL** | Your complete URL with token from Step 2.1 |

**Example:**
```
https://mcp-neo4j-cypher.eduardodominguezotero.workers.dev/mcp?token=YOUR_TOKEN_HERE
```

### 2.4 Verify Connection

After adding the server:

1. Claude should show the server as **"Connected"**
2. You should see **3 tools** available:
   - `get_neo4j_schema`
   - `read_neo4j_cypher`
   - `write_neo4j_cypher`

> ⚠️ **Troubleshooting:** If Claude shows "Disconnected" or fails to connect:
> - Verify your token is correct and hasn't expired (tokens last 24 hours)
> - Check that your Neo4j database is still running and accessible
> - Ensure the URL is properly formatted with the token parameter
> - Try creating a new connection from `/setup` to get a fresh token

---

## Step 3: Start Using Natural Language Queries

Once connected, you can ask Claude to query your Neo4j database using natural language!

### First Query: Get Your Schema

Start by asking Claude to understand your database:

```
Can you show me the schema of my Neo4j database?
```

Claude will use the `get_neo4j_schema` tool to retrieve:
- Node labels and their properties
- Relationship types
- Property types and indexes

### Query Your Data

Now you can ask questions about your data:

```
How many users are in my database?
```

```
Show me all products with price greater than $100
```

```
Find the shortest path between user "Alice" and user "Bob"
```

---

## Available Tools

### 1. `get_neo4j_schema`

Retrieves the database schema including labels, properties, and relationships.

**Use case:** Understanding your database structure before querying.

**Example prompt:**
```
What does my database schema look like?
```

### 2. `read_neo4j_cypher`

Executes read-only Cypher queries (MATCH, RETURN, etc.).

**Use case:** Retrieving data, analyzing patterns, running reports.

**Example prompts:**
```
Find all customers who made purchases in the last 30 days
```
```
Show me the top 10 most connected nodes
```
```
What are the relationships between Company nodes?
```

### 3. `write_neo4j_cypher`

Executes write operations (CREATE, MERGE, DELETE, SET).

**Use case:** Creating nodes, updating properties, managing relationships.

**Example prompts:**
```
Create a new user node with name "John" and email "john@example.com"
```
```
Update the status of order #12345 to "shipped"
```
```
Delete all nodes labeled "TempData"
```

> ⚠️ **Note:** Write operations are disabled if you checked "Read Only" during setup.

---

## Example Queries

### E-commerce Database

```
Show me all orders from the last week with their total amounts
```

```
Which products are frequently bought together?
```

```
Find customers who haven't made a purchase in 90 days
```

### Social Network

```
Who are the most influential users based on follower count?
```

```
Find communities of users who interact frequently
```

```
What's the average degree of separation between users?
```

### Knowledge Graph

```
Show me all concepts related to "Machine Learning"
```

```
Find the path connecting "Python" to "Data Science"
```

```
What entities are mentioned in documents from 2024?
```

### Movie Database (Neo4j Sample)

```
Which actors have worked with Tom Hanks?
```

```
Find movies where the director also acted
```

```
What's the average rating of movies by genre?
```

---

## Troubleshooting

### Connection Issues

#### "Connection failed" during setup

| Problem | Solution |
|---------|----------|
| Invalid URI format | Use `neo4j+s://` for Aura, `bolt://` for local |
| Wrong credentials | Double-check username and password |
| Firewall blocking | Ensure port 7687 is accessible |
| Database not running | Start your Neo4j instance |

#### "Session expired" in Claude

Your session token expires after 24 hours. To fix:

1. Go back to the setup page
2. Re-enter your credentials
3. Get a new session token
4. Update the token in Claude.ai settings

### Query Issues

#### "No results found"

- Check if your database has data: `MATCH (n) RETURN count(n)`
- Verify node labels are correct (they're case-sensitive)
- Ask Claude to show the schema first

#### "Query timeout"

- Add LIMIT to large queries
- Use more specific WHERE clauses
- Ask Claude to optimize the query

#### "Write operation not allowed"

- You enabled "Read Only" mode during setup
- Create a new connection without the read-only flag

### Tool Not Working

#### Claude doesn't use the Neo4j tools

Try being more explicit:

```
Use the Neo4j database to find all users
```

```
Query my graph database for products
```

#### "Tool execution failed"

- Check if your Neo4j database is online
- Verify your session token is still valid
- Try reconnecting through the setup page

---

## Security Considerations

### Your Data is Safe

- ✅ **Credentials encrypted:** Your Neo4j password is encrypted with AES-256-GCM
- ✅ **No credential storage:** We don't store your password in plain text
- ✅ **Session tokens:** Expire after 24 hours
- ✅ **HTTPS only:** All communication is encrypted

### Best Practices

1. **Use read-only mode** for exploration and reporting
2. **Create a dedicated Neo4j user** with limited permissions
3. **Don't share your session token** with others
4. **Regenerate tokens** if you suspect compromise

### Query Safety

The server automatically blocks dangerous operations:

- ❌ `DROP DATABASE`
- ❌ `CREATE USER` / `DROP USER`
- ❌ `GRANT` / `REVOKE`
- ❌ System procedures (`dbms.*`)
- ❌ `LOAD CSV` from external URLs

### Rate Limiting

To prevent abuse, the server limits:
- **100 requests per minute** per user
- Queries timeout after **30 seconds**

---

## FAQ

### Can I connect multiple databases?

Currently, each session connects to one database. To switch databases:
1. Go to the setup page
2. Enter new credentials
3. Get a new session token
4. Update Claude.ai settings

### Does Claude see my data?

Yes, Claude can see query results to answer your questions. This is necessary for the integration to work. Don't query sensitive data you wouldn't want processed by an AI.

### How do I disconnect?

In Claude.ai:
1. Go to Settings → Integrations
2. Find the Neo4j server
3. Click "Remove" or "Disconnect"

### Is there a query history?

The server logs queries for security auditing but doesn't provide a user-facing history. You can see your conversation history in Claude.ai.

### Can I use this with Claude Desktop?

Yes! The MCP server works with Claude Desktop too. Add this to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "neo4j": {
      "url": "https://mcp-neo4j-cypher.eduardodominguezotero.workers.dev/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_SESSION_TOKEN"
      }
    }
  }
}
```

---

## Support

If you encounter issues:

1. Check the [Troubleshooting](#troubleshooting) section
2. Verify your Neo4j database is accessible
3. Try creating a new session token

For bugs or feature requests, please open an issue on the GitHub repository.

---

## Quick Reference Card

```
┌─────────────────────────────────────────────────────────────┐
│  MCP Neo4j Cypher Server - Quick Reference                  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Setup URL:                                                 │
│  https://mcp-neo4j-cypher.eduardodominguezotero.workers.dev/setup  │
│                                                             │
│  MCP Server URL:                                            │
│  https://mcp-neo4j-cypher.eduardodominguezotero.workers.dev/mcp    │
│                                                             │
│  Tools:                                                     │
│  • get_neo4j_schema  - View database structure              │
│  • read_neo4j_cypher - Query data (read-only)               │
│  • write_neo4j_cypher - Modify data (if enabled)            │
│                                                             │
│  Session Duration: 24 hours                                 │
│  Rate Limit: 100 requests/minute                            │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```
