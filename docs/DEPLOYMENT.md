# Deployment Guide

Complete guide for deploying the MCP Neo4j Cypher Server to Cloudflare Workers.

## Prerequisites

- [Node.js](https://nodejs.org/) 18 or later
- [Cloudflare account](https://dash.cloudflare.com/sign-up) (free tier works)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
- Neo4j database (Aura free tier or self-hosted with HTTP API enabled)

## Step 1: Clone and Install

```bash
git clone https://github.com/your-org/mcp-neo4j-cypher-cf.git
cd mcp-neo4j-cypher-cf
npm install
```

## Step 2: Authenticate with Cloudflare

```bash
npx wrangler login
```

This opens a browser window to authenticate with your Cloudflare account.

## Step 3: Create Cloudflare Resources

### Create D1 Database

```bash
npx wrangler d1 create mcp-neo4j-users
```

Output:
```
Created database 'mcp-neo4j-users'
database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

**Save this `database_id` for the next step.**

### Create KV Namespace

```bash
npx wrangler kv namespace create SESSIONS
```

Output:
```
Created namespace 'SESSIONS'
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

**Save this `id` for the next step.**

## Step 4: Configure wrangler.toml

Update `wrangler.toml` with your resource IDs:

```toml
name = "mcp-neo4j-cypher"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[d1_databases]]
binding = "DB"
database_name = "mcp-neo4j-users"
database_id = "YOUR_D1_DATABASE_ID"  # <-- Replace this

[[kv_namespaces]]
binding = "SESSIONS"
id = "YOUR_KV_NAMESPACE_ID"  # <-- Replace this

[vars]
ENVIRONMENT = "production"
DEFAULT_READ_TIMEOUT = "30"
DEFAULT_TOKEN_LIMIT = "10000"
DEFAULT_SCHEMA_SAMPLE = "1000"
ALLOWED_ORIGINS = "https://claude.ai"
```

## Step 5: Set Encryption Key

Generate a secure encryption key and set it as a secret:

```bash
# Generate a random key
openssl rand -base64 32

# Set it as a Cloudflare secret
npx wrangler secret put ENCRYPTION_KEY
# Paste the generated key when prompted
```

**Important**: Save this key somewhere secure. You'll need it if you redeploy or migrate.

## Step 6: Initialize Database

Apply the database schema:

```bash
npx wrangler d1 execute mcp-neo4j-users --remote --file=schema.sql
```

Verify the tables were created:

```bash
npx wrangler d1 execute mcp-neo4j-users --remote --command="SELECT name FROM sqlite_master WHERE type='table';"
```

Expected output:
```
name
users
connections
```

## Step 7: Deploy

```bash
npx wrangler deploy
```

Output:
```
Uploaded mcp-neo4j-cypher (X.XX sec)
Published mcp-neo4j-cypher (X.XX sec)
  https://mcp-neo4j-cypher.your-subdomain.workers.dev
```

## Step 8: Verify Deployment

### Health Check

```bash
curl https://mcp-neo4j-cypher.your-subdomain.workers.dev/health
```

Expected response:
```json
{
  "status": "ok",
  "server": "mcp-neo4j-cypher",
  "version": "1.0.0",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### Setup Page

Visit `https://mcp-neo4j-cypher.your-subdomain.workers.dev/setup` in your browser.

You should see the connection setup form.

## Environment Configuration

### Production vs Development

For different environments, create separate wrangler configurations:

**wrangler.toml** (development):
```toml
[env.development]
name = "mcp-neo4j-cypher-dev"

[[env.development.d1_databases]]
binding = "DB"
database_name = "mcp-neo4j-users-dev"
database_id = "dev-database-id"

[[env.development.kv_namespaces]]
binding = "SESSIONS"
id = "dev-kv-id"

[env.development.vars]
ENVIRONMENT = "development"
```

Deploy to development:
```bash
npx wrangler deploy --env development
```

### Custom Domain

To use a custom domain:

1. Go to Cloudflare Dashboard > Workers & Pages
2. Select your worker
3. Go to Settings > Triggers
4. Add a custom domain

## Updating

To update the deployment:

```bash
# Pull latest changes
git pull

# Install any new dependencies
npm install

# Run tests
npm test

# Deploy
npx wrangler deploy
```

## Database Migrations

If the schema changes, apply migrations:

```bash
# Apply new migration
npx wrangler d1 execute mcp-neo4j-users --remote --file=migrations/001_add_column.sql
```

## Monitoring

### View Logs

Real-time logs:
```bash
npx wrangler tail
```

### Cloudflare Dashboard

- Go to Workers & Pages > your worker
- View metrics: requests, errors, CPU time
- View logs in real-time

## Troubleshooting

### "Database not found"

Ensure the D1 database ID in `wrangler.toml` matches the one created:

```bash
npx wrangler d1 list
```

### "KV namespace not found"

Ensure the KV namespace ID in `wrangler.toml` matches:

```bash
npx wrangler kv namespace list
```

### "Encryption key error"

Verify the secret is set:

```bash
npx wrangler secret list
```

If missing, set it again:

```bash
npx wrangler secret put ENCRYPTION_KEY
```

### CORS Errors

Update `ALLOWED_ORIGINS` in `wrangler.toml`:

```toml
[vars]
ALLOWED_ORIGINS = "https://claude.ai,https://your-other-domain.com"
```

Then redeploy.

## Backup and Recovery

### Export User Data

```bash
npx wrangler d1 export mcp-neo4j-users --remote --output=backup.sql
```

### Import User Data

```bash
npx wrangler d1 execute mcp-neo4j-users --remote --file=backup.sql
```

## Security Checklist

- [ ] `ENCRYPTION_KEY` is set and stored securely
- [ ] `ALLOWED_ORIGINS` is restricted to trusted domains
- [ ] Database has been initialized with schema
- [ ] HTTPS is enforced (automatic with Workers)
- [ ] Rate limiting is enabled (default: 100 req/min)
