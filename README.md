# MCP Neo4j Cypher Server for Cloudflare Workers

A Model Context Protocol (MCP) server that enables Claude to query Neo4j databases using natural language. Runs on Cloudflare Workers for serverless, multi-tenant deployment.

## Features

- **3 MCP Tools**: `get_neo4j_schema`, `read_neo4j_cypher`, `write_neo4j_cypher`
- **Multi-tenant**: Each user connects their own Neo4j database
- **Serverless**: Runs on Cloudflare Workers (no servers to manage)
- **Secure**: AES-256-GCM encryption, rate limiting, query validation
- **Compatible**: Works with Neo4j Aura, self-hosted Neo4j 4.x/5.x

## Quick Start

### 1. Deploy to Cloudflare

```bash
# Clone the repository
git clone https://github.com/your-org/mcp-neo4j-cypher-cf.git
cd mcp-neo4j-cypher-cf

# Install dependencies
npm install

# Create Cloudflare resources
npx wrangler d1 create mcp-neo4j-users
npx wrangler kv namespace create SESSIONS

# Update wrangler.toml with the IDs from above

# Set encryption key
npx wrangler secret put ENCRYPTION_KEY
# Enter a 32+ character random string

# Initialize database
npx wrangler d1 execute mcp-neo4j-users --file=schema.sql

# Deploy
npx wrangler deploy
```

### 2. Configure Your Neo4j Connection

1. Visit `https://your-worker.workers.dev/setup`
2. Enter your Neo4j credentials:
   - **URI**: `neo4j+s://xxxxx.databases.neo4j.io` (Aura) or your server
   - **Username**: Usually `neo4j`
   - **Password**: Your database password
   - **Database**: Usually `neo4j`
3. Click "Test & Save Connection"
4. Copy the session token

### 3. Use with Claude

Add the MCP server to your Claude configuration:

```json
{
  "mcpServers": {
    "neo4j": {
      "url": "https://your-worker.workers.dev/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_SESSION_TOKEN"
      }
    }
  }
}
```

Now you can ask Claude things like:
- "What's the schema of my Neo4j database?"
- "Find all Person nodes and their relationships"
- "Create a new Movie node with title 'Inception'"

## Available Tools

| Tool | Description |
|------|-------------|
| `get_neo4j_schema` | Retrieves database schema (labels, properties, relationships) |
| `read_neo4j_cypher` | Executes read-only Cypher queries (MATCH, RETURN) |
| `write_neo4j_cypher` | Executes write queries (CREATE, MERGE, DELETE) |

## Documentation

- [Deployment Guide](docs/DEPLOYMENT.md) - Detailed setup and configuration
- [Security](docs/SECURITY.md) - Rate limiting, blocked queries, encryption
- [API Reference](docs/API.md) - HTTP endpoints and MCP tools

## Development

```bash
# Install dependencies
npm install

# Run locally
npm run dev

# Run tests
npm test

# Type check
npm run typecheck
```

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│   Claude    │────▶│ Cloudflare Worker│────▶│  Neo4j Aura │
│  (claude.ai)│◀────│   (MCP Server)   │◀────│  (Database) │
└─────────────┘     └──────────────────┘     └─────────────┘
                            │
                    ┌───────┴───────┐
                    │               │
                ┌───▼───┐     ┌─────▼─────┐
                │  D1   │     │    KV     │
                │(Users)│     │(Sessions) │
                └───────┘     └───────────┘
```

## Requirements

- Node.js 18+
- Cloudflare account (free tier works)
- Neo4j database (Aura free tier or self-hosted)

## Configuration

| Environment Variable | Description | Default |
|---------------------|-------------|---------|
| `ENCRYPTION_KEY` | Secret key for encrypting credentials | Required |
| `DEFAULT_READ_TIMEOUT` | Query timeout in seconds | `30` |
| `DEFAULT_TOKEN_LIMIT` | Max tokens in responses | `10000` |
| `DEFAULT_SCHEMA_SAMPLE` | Nodes to sample for schema | `1000` |
| `ALLOWED_ORIGINS` | CORS allowed origins | `https://claude.ai` |

## License

MIT

## Credits

Based on [mcp-neo4j-cypher](https://github.com/neo4j-contrib/mcp-neo4j) by Neo4j Contributors.
