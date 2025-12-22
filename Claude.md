# Claude.md - MCP Neo4j Cypher Server en Cloudflare Workers

## 📋 Descripción del Proyecto

Servidor MCP (Model Context Protocol) que permite a usuarios de Claude.ai conectar sus propias instancias de Neo4j Aura y ejecutar consultas Cypher mediante lenguaje natural. Desplegado en Cloudflare Workers como infraestructura serverless.

**Objetivo:** Crear un puente entre Claude.ai y Neo4j que permita:
- Extraer el esquema de bases de datos Neo4j
- Ejecutar queries Cypher de lectura y escritura
- Gestionar múltiples usuarios con sus propias conexiones
- Mantener seguridad y aislamiento entre usuarios

**Producto Final:** Un endpoint HTTPS que Claude.ai consume vía protocolo MCP, permitiendo conversaciones como:
```
Usuario: "¿Qué contiene mi base de datos Neo4j?"
Claude: [Usa get_neo4j_schema] "Tu BD tiene labels: Person, Movie..."

Usuario: "Muéstrame 5 películas"
Claude: [Usa read_neo4j_cypher] MATCH (m:Movie)... [Resultados]
```

---

## 🏗️ Arquitectura del Sistema

### Stack Tecnológico

```yaml
Runtime: Cloudflare Workers (V8 Engine)
Lenguaje: TypeScript 5.3+
Transporte: HTTP/SSE (Server-Sent Events)
Storage:
  - D1 (SQLite): Usuarios y conexiones
  - KV: Sesiones y caché
  - Secrets: Claves de encriptación
Base de datos: Neo4j Aura (HTTP API)
Protocolo: JSON-RPC 2.0 (MCP spec)
```

### Diagrama de Arquitectura

```
┌────────────────────────────────────────────────────────────────┐
│                      CLAUDE.AI CLIENT                          │
│  MCP Host ejecutando en browser/desktop                       │
└───────────────────────┬────────────────────────────────────────┘
                        │ HTTPS POST (JSON-RPC 2.0)
                        ▼
┌────────────────────────────────────────────────────────────────┐
│            CLOUDFLARE WORKER (Edge Computing)                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Entry Point (src/index.ts)                              │  │
│  │  • CORS handling                                         │  │
│  │  • Route dispatching                                     │  │
│  └────────────┬─────────────────────────────────────────────┘  │
│               │                                                 │
│  ┌────────────▼─────────────────────────────────────────────┐  │
│  │  MCP Protocol Layer (src/mcp/)                           │  │
│  │  • JSON-RPC 2.0 parsing                                  │  │
│  │  • Method routing (initialize, tools/list, tools/call)   │  │
│  │  • Error handling                                        │  │
│  └────────────┬─────────────────────────────────────────────┘  │
│               │                                                 │
│  ┌────────────▼─────────────────────────────────────────────┐  │
│  │  Authentication Layer (src/auth/)                        │  │
│  │  • Token validation                                      │  │
│  │  • User resolution                                       │  │
│  │  • Session management                                    │  │
│  └────────────┬─────────────────────────────────────────────┘  │
│               │                                                 │
│  ┌────────────▼─────────────────────────────────────────────┐  │
│  │  Neo4j Client (src/neo4j/)                               │  │
│  │  • HTTP API connection                                   │  │
│  │  • Query execution                                       │  │
│  │  • Result transformation                                 │  │
│  └────────────┬─────────────────────────────────────────────┘  │
│               │                                                 │
│  ┌────────────▼─────────────────────────────────────────────┐  │
│  │  Storage Layer                                           │  │
│  │  • D1: Users & Connections (encrypted)                   │  │
│  │  • KV: Sessions & Cache                                  │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────┬───────────────────────────────────────┘
                         │ HTTPS (Neo4j HTTP API)
                         ▼
┌────────────────────────────────────────────────────────────────┐
│                   NEO4J AURA (User's DB)                       │
│  • neo4j+s://xxx.databases.neo4j.io                           │
│  • User-specific credentials                                   │
│  • Isolated per user                                          │
└────────────────────────────────────────────────────────────────┘
```

### Flujo de una Request MCP

```
1. Claude.ai envía:
   POST /sse
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "tools/call",
     "params": {
       "name": "read_neo4j_cypher",
       "arguments": { "cypher": "MATCH (n) RETURN n LIMIT 5" }
     }
   }

2. Worker valida token → obtiene user_id
3. Worker obtiene conexión Neo4j del usuario desde D1
4. Worker desencripta credenciales
5. Neo4jClient ejecuta query vía HTTP API
6. Worker transforma resultados
7. Worker responde:
   {
     "jsonrpc": "2.0",
     "id": 1,
     "result": {
       "content": [{ "type": "text", "text": "..." }]
     }
   }
```

---

## 📁 Estructura de Archivos del Proyecto

```
mcp-neo4j-cypher-cf/
├── src/
│   ├── index.ts                 # Entry point principal
│   ├── types.ts                 # TypeScript interfaces y types
│   │
│   ├── mcp/                     # Capa del protocolo MCP
│   │   ├── protocol.ts          # Parser y router JSON-RPC 2.0
│   │   ├── tools.ts             # Definiciones de herramientas MCP
│   │   └── handlers.ts          # Lógica de ejecución de tools
│   │
│   ├── neo4j/                   # Cliente Neo4j
│   │   ├── client.ts            # Conexión HTTP API
│   │   ├── schema.ts            # Extracción de schema
│   │   └── validator.ts         # Validación de queries Cypher
│   │
│   ├── auth/                    # Autenticación y seguridad
│   │   ├── session.ts           # Gestión de sesiones
│   │   ├── crypto.ts            # Encriptación/desencriptación
│   │   └── middleware.ts        # Middleware de autenticación
│   │
│   ├── config/                  # Configuración
│   │   └── ui.ts                # HTML para página de setup
│   │
│   └── utils/                   # Utilidades
│       ├── cors.ts              # Headers CORS
│       ├── errors.ts            # Error handling
│       └── logger.ts            # Logging estructurado
│
├── test/                        # Tests
│   ├── unit/
│   │   ├── neo4j.test.ts
│   │   ├── auth.test.ts
│   │   └── mcp.test.ts
│   └── integration/
│       └── e2e.test.ts
│
├── wrangler.toml                # Configuración Cloudflare Workers
├── schema.sql                   # Schema D1 database
├── package.json
├── tsconfig.json
├── .env.example                 # Variables de entorno ejemplo
└── README.md
```

---

## 🔧 Configuración Inicial

### Prerequisitos

```bash
# Node.js 18+
node --version  # v18.0.0+

# Wrangler CLI
npm install -g wrangler
wrangler --version

# Autenticación Cloudflare
wrangler login
```

### Setup del Proyecto

```bash
# Crear proyecto
mkdir mcp-neo4j-cypher-cf
cd mcp-neo4j-cypher-cf

# Inicializar Wrangler
wrangler init

# Instalar dependencias
npm install

# Crear infraestructura Cloudflare
wrangler d1 create mcp-neo4j-users
wrangler kv:namespace create "NEO4J_SESSIONS"

# Aplicar schema D1
wrangler d1 execute mcp-neo4j-users --file=schema.sql --remote

# Configurar secrets
openssl rand -base64 32 | wrangler secret put ENCRYPTION_KEY
```

### Variables de Entorno

Copiar `.env.example` a `.env.local`:

```bash
# Cloudflare Account
CLOUDFLARE_ACCOUNT_ID=your_account_id
CLOUDFLARE_API_TOKEN=your_api_token

# D1 Database
D1_DATABASE_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx

# KV Namespace
KV_NAMESPACE_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Secrets (usar wrangler secret put)
# ENCRYPTION_KEY=<generated>
```

---

## 💻 Guías de Desarrollo

### Comandos Principales

```bash
# Desarrollo local con live reload
npm run dev

# Deploy a producción
npm run deploy

# Ver logs en tiempo real
npm run tail

# Ejecutar tests
npm test

# Lint y format
npm run lint
npm run format

# Type checking
npm run typecheck

# Interactuar con D1 local
wrangler d1 execute mcp-neo4j-users --local --command="SELECT * FROM users"

# Ver datos en KV
wrangler kv:key get "session:xxxxx" --binding=NEO4J_SESSIONS
```

### Workflow de Desarrollo Típico

1. **Crear nueva feature:**
   ```bash
   git checkout -b feature/nueva-funcionalidad
   ```

2. **Desarrollar localmente:**
   ```bash
   npm run dev
   # Abrir: http://localhost:8787
   ```

3. **Probar cambios:**
   ```bash
   npm test
   curl -X POST http://localhost:8787/sse \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'
   ```

4. **Deploy a staging:**
   ```bash
   wrangler deploy --env staging
   ```

5. **Deploy a producción:**
   ```bash
   wrangler deploy
   ```

---

## 🎯 Patrones de Código y Convenciones

### TypeScript Types

**SIEMPRE** definir tipos explícitos. NO usar `any`.

```typescript
// ✅ CORRECTO
interface Neo4jConnection {
  id: string;
  user_id: string;
  neo4j_uri: string;
  neo4j_user: string;
  neo4j_password: string;
}

async function getConnection(userId: string, env: Env): Promise<Neo4jConnection | null> {
  const result = await env.DB.prepare(
    'SELECT * FROM connections WHERE user_id = ?'
  ).bind(userId).first();
  
  return result as Neo4jConnection | null;
}

// ❌ INCORRECTO
async function getConnection(userId: any, env: any): Promise<any> {
  const result = await env.DB.prepare(
    'SELECT * FROM connections WHERE user_id = ?'
  ).bind(userId).first();
  
  return result;
}
```

### Error Handling

Usar try-catch y errores tipados:

```typescript
// src/utils/errors.ts
export class Neo4jConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'Neo4jConnectionError';
  }
}

export class AuthenticationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthenticationError';
  }
}

// Uso:
try {
  const result = await neo4jClient.query(cypher);
} catch (error) {
  if (error instanceof Neo4jConnectionError) {
    return new Response(JSON.stringify({
      jsonrpc: '2.0',
      id: requestId,
      error: {
        code: -32001,
        message: 'Failed to connect to Neo4j'
      }
    }), { status: 500 });
  }
  throw error;
}
```

### Async/Await

**SIEMPRE** usar async/await, NUNCA `.then()`:

```typescript
// ✅ CORRECTO
async function fetchData(url: string): Promise<Data> {
  const response = await fetch(url);
  const data = await response.json();
  return data;
}

// ❌ INCORRECTO
function fetchData(url: string): Promise<Data> {
  return fetch(url)
    .then(response => response.json())
    .then(data => data);
}
```

### Logging

Usar logging estructurado:

```typescript
// src/utils/logger.ts
export function log(level: 'info' | 'warn' | 'error', message: string, metadata?: any) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...metadata
  };
  console.log(JSON.stringify(entry));
}

// Uso:
log('info', 'User authenticated', { userId: user.id });
log('error', 'Neo4j query failed', { 
  userId: user.id, 
  cypher: query,
  error: error.message 
});
```

### Manejo de Secrets

NUNCA hardcodear secrets:

```typescript
// ✅ CORRECTO
const encryptionKey = env.ENCRYPTION_KEY;
const encrypted = await encrypt(data, encryptionKey);

// ❌ INCORRECTO
const encrypted = await encrypt(data, 'my-secret-key-12345');
```

---

## 🔒 Consideraciones de Seguridad

### Encriptación de Credenciales

Las credenciales Neo4j DEBEN estar encriptadas en D1:

```typescript
// Al guardar:
const encryptedUri = encrypt(uri, env.ENCRYPTION_KEY);
const encryptedUser = encrypt(user, env.ENCRYPTION_KEY);
const encryptedPassword = encrypt(password, env.ENCRYPTION_KEY);

await env.DB.prepare(`
  INSERT INTO connections (neo4j_uri, neo4j_user, neo4j_password)
  VALUES (?, ?, ?)
`).bind(encryptedUri, encryptedUser, encryptedPassword).run();

// Al leer:
const connection = await env.DB.prepare('SELECT * FROM connections WHERE id = ?')
  .bind(connectionId).first();

const uri = decrypt(connection.neo4j_uri, env.ENCRYPTION_KEY);
const user = decrypt(connection.neo4j_user, env.ENCRYPTION_KEY);
const password = decrypt(connection.neo4j_password, env.ENCRYPTION_KEY);
```

### Validación de Queries Cypher

Validar queries ANTES de ejecutar:

```typescript
// src/neo4j/validator.ts
export function validateReadQuery(cypher: string): boolean {
  const normalized = cypher.trim().toLowerCase();
  
  // Solo permitir queries de lectura
  const readOnlyPattern = /^(match|return|with|unwind|call\s+{)/;
  if (!readOnlyPattern.test(normalized)) {
    return false;
  }
  
  // Bloquear operaciones de escritura
  const writePatterns = ['create', 'merge', 'delete', 'set', 'remove'];
  for (const pattern of writePatterns) {
    if (normalized.includes(pattern)) {
      return false;
    }
  }
  
  return true;
}

// Uso:
if (!validateReadQuery(cypher)) {
  throw new Error('Invalid read query. Use write_neo4j_cypher for write operations.');
}
```

### Rate Limiting

Implementar rate limiting por usuario:

```typescript
async function checkRateLimit(userId: string, env: Env): Promise<boolean> {
  const minute = Math.floor(Date.now() / 60000);
  const key = `rate:${userId}:${minute}`;
  
  const count = await env.SESSIONS.get(key);
  const currentCount = count ? parseInt(count) : 0;
  
  if (currentCount >= 100) {
    throw new Error('Rate limit exceeded. Max 100 requests per minute.');
  }
  
  await env.SESSIONS.put(key, String(currentCount + 1), {
    expirationTtl: 60
  });
  
  return true;
}
```

### CORS Seguro

```typescript
// src/utils/cors.ts
export function getCorsHeaders(origin: string | null): Record<string, string> {
  // En producción, validar origin contra whitelist
  const allowedOrigins = [
    'https://claude.ai',
    'https://www.claude.ai'
  ];
  
  const corsOrigin = (origin && allowedOrigins.includes(origin)) 
    ? origin 
    : 'https://claude.ai';
  
  return {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  };
}
```

---

## 🧪 Testing

### Unit Tests

```typescript
// test/unit/neo4j.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { Neo4jClient } from '../../src/neo4j/client';

describe('Neo4jClient', () => {
  let client: Neo4jClient;
  
  beforeEach(() => {
    const mockConnection = {
      neo4j_uri: 'neo4j+s://test.databases.neo4j.io',
      neo4j_user: 'neo4j',
      neo4j_password: 'password',
      neo4j_database: 'neo4j'
    };
    
    const mockEnv = {
      ENCRYPTION_KEY: 'test-key'
    };
    
    client = new Neo4jClient(mockConnection, mockEnv);
  });
  
  it('should convert Neo4j URI to HTTP URL', () => {
    expect(client['getHttpUrl']()).toBe('https://test.databases.neo4j.io');
  });
  
  it('should handle query errors gracefully', async () => {
    await expect(client.query('INVALID QUERY')).rejects.toThrow();
  });
});
```

### Integration Tests

```typescript
// test/integration/e2e.test.ts
import { describe, it, expect } from 'vitest';

describe('MCP Protocol E2E', () => {
  const baseUrl = 'http://localhost:8787';
  
  it('should handle initialize request', async () => {
    const response = await fetch(`${baseUrl}/sse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize'
      })
    });
    
    const data = await response.json();
    expect(data.result.protocolVersion).toBe('2024-11-05');
    expect(data.result.serverInfo.name).toBe('mcp-neo4j-cypher');
  });
  
  it('should list available tools', async () => {
    const response = await fetch(`${baseUrl}/sse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/list'
      })
    });
    
    const data = await response.json();
    expect(data.result.tools).toHaveLength(3);
    expect(data.result.tools[0].name).toBe('get_neo4j_schema');
  });
});
```

### Ejecutar Tests

```bash
# Todos los tests
npm test

# Con coverage
npm test -- --coverage

# Watch mode
npm test -- --watch

# Específico
npm test -- test/unit/neo4j.test.ts
```

---

## 📊 Monitoreo y Debugging

### Logs Estructurados

```typescript
// Implementar logging consistente
function logRequest(request: Request, userId: string, duration: number) {
  console.log(JSON.stringify({
    type: 'request',
    timestamp: new Date().toISOString(),
    userId,
    method: request.method,
    url: request.url,
    duration
  }));
}

function logError(error: Error, context: any) {
  console.error(JSON.stringify({
    type: 'error',
    timestamp: new Date().toISOString(),
    error: {
      name: error.name,
      message: error.message,
      stack: error.stack
    },
    context
  }));
}
```

### Métricas Clave

```typescript
// Trackear métricas importantes
interface Metrics {
  requests_total: number;
  requests_success: number;
  requests_error: number;
  neo4j_queries_total: number;
  neo4j_queries_duration_ms: number[];
  cache_hits: number;
  cache_misses: number;
}

// Guardar métricas en KV cada minuto
async function saveMetrics(metrics: Metrics, env: Env) {
  const key = `metrics:${Math.floor(Date.now() / 60000)}`;
  await env.SESSIONS.put(key, JSON.stringify(metrics), {
    expirationTtl: 86400 // 24 horas
  });
}
```

### Debugging Local

```bash
# Ver logs en tiempo real
npm run tail

# Consultar D1 local
wrangler d1 execute mcp-neo4j-users --local \
  --command="SELECT * FROM users LIMIT 10"

# Ver sesiones en KV
wrangler kv:key list --binding=NEO4J_SESSIONS

# Inspeccionar request/response
curl -v -X POST http://localhost:8787/sse \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'
```

---

## 🚀 Deploy y CI/CD

### Ambientes

Configurar múltiples ambientes en `wrangler.toml`:

```toml
name = "mcp-neo4j-cypher"

[env.staging]
name = "mcp-neo4j-cypher-staging"
vars = { ENVIRONMENT = "staging" }

[env.production]
name = "mcp-neo4j-cypher"
vars = { ENVIRONMENT = "production" }
```

Deploy:
```bash
# Staging
wrangler deploy --env staging

# Production
wrangler deploy --env production
```

### GitHub Actions (CI/CD)

```yaml
# .github/workflows/deploy.yml
name: Deploy to Cloudflare Workers

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - run: npm ci
      - run: npm test
      - run: npm run lint
      - run: npm run typecheck
  
  deploy-staging:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: deploy --env staging
  
  deploy-production:
    needs: deploy-staging
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: production
    steps:
      - uses: actions/checkout@v3
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          command: deploy --env production
```

---

## 🎯 Roadmap y TODOs

### Fase 1: MVP (Actual)
- [x] Protocolo MCP básico
- [x] Autenticación con tokens
- [x] Cliente Neo4j HTTP
- [x] 3 herramientas: schema, read, write
- [x] UI de configuración
- [ ] Encriptación AES-GCM real
- [ ] Tests completos

### Fase 2: Producción
- [ ] OAuth 2.1 (Google/GitHub)
- [ ] Rate limiting robusto
- [ ] Logging estructurado
- [ ] Métricas y monitoring
- [ ] Error tracking (Sentry)
- [ ] Documentación API

### Fase 3: Optimización
- [ ] Caché inteligente de schema
- [ ] Query optimization
- [ ] Connection pooling
- [ ] Batch operations
- [ ] WebSocket transport

### Fase 4: Features Avanzadas
- [ ] Multi-database por usuario
- [ ] Query history
- [ ] Scheduled queries
- [ ] Data export/import
- [ ] Admin dashboard

---

## 📚 Referencias y Recursos

### Documentación Oficial

- [Model Context Protocol Spec](https://modelcontextprotocol.io/docs/specification)
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Cloudflare D1 Docs](https://developers.cloudflare.com/d1/)
- [Cloudflare KV Docs](https://developers.cloudflare.com/kv/)
- [Neo4j HTTP API](https://neo4j.com/docs/http-api/current/)
- [Neo4j Aura](https://neo4j.com/cloud/aura/)

### Tools y Librerías

- [Wrangler CLI](https://github.com/cloudflare/workers-sdk)
- [Vitest](https://vitest.dev/) - Testing framework
- [TypeScript](https://www.typescriptlang.org/)
- [ESLint](https://eslint.org/)
- [Prettier](https://prettier.io/)

### MCP Servers Relacionados

- [mcp-neo4j (oficial)](https://github.com/neo4j-contrib/mcp-neo4j)
- [mcp-neo4j-memory](https://github.com/neo4j-contrib/mcp-neo4j/tree/main/servers/mcp-neo4j-memory)
- [mcp-neo4j-cloud-aura-api](https://github.com/neo4j-contrib/mcp-neo4j/tree/main/servers/mcp-neo4j-cloud-aura-api)

---

## 🤝 Contribución

### Proceso de Desarrollo

1. **Fork y clone** el repositorio
2. **Crear branch** para feature/bugfix
3. **Desarrollar** siguiendo convenciones
4. **Escribir tests** para nuevo código
5. **Commit** con mensajes descriptivos
6. **Push** y abrir Pull Request
7. **Code review** y merge

### Commit Messages

Seguir [Conventional Commits](https://www.conventionalcommits.org/):

```bash
feat: add query validation for read operations
fix: correct Neo4j URI parsing for Aura instances
docs: update setup instructions
test: add unit tests for auth middleware
refactor: simplify error handling in MCP protocol
perf: implement schema caching with 5min TTL
chore: update dependencies
```

### Code Review Checklist

- [ ] Código sigue convenciones del proyecto
- [ ] Tests incluidos y pasando
- [ ] TypeScript types correctos (no `any`)
- [ ] Errores manejados apropiadamente
- [ ] Logging implementado
- [ ] Documentación actualizada
- [ ] Sin secrets hardcodeados
- [ ] Performance considerado

---

## 🐛 Troubleshooting

### Errores Comunes

**Error:** `D1_ERROR: no such table: users`
```bash
# Solución: Aplicar schema
wrangler d1 execute mcp-neo4j-users --file=schema.sql --remote
```

**Error:** `KV binding 'SESSIONS' not found`
```bash
# Solución: Verificar wrangler.toml tiene el binding correcto
[[kv_namespaces]]
binding = "SESSIONS"
id = "tu_namespace_id"
```

**Error:** `Neo4j HTTP Error: 401 Unauthorized`
```bash
# Solución: Verificar credenciales Neo4j
# Las credenciales están encriptadas en D1
# Revisar que ENCRYPTION_KEY no haya cambiado
```

**Error:** `TypeError: env.ENCRYPTION_KEY is undefined`
```bash
# Solución: Configurar secret
openssl rand -base64 32 | wrangler secret put ENCRYPTION_KEY
```

### Debugging Tips

1. **Usar wrangler tail para logs en tiempo real**
2. **Inspeccionar requests con curl -v**
3. **Verificar D1 data directamente**
4. **Comprobar KV values**
5. **Revisar métricas en Cloudflare Dashboard**

---

## 💡 Tips para Claude Code

### Cuando trabajes en este proyecto:

1. **SIEMPRE** lee este Claude.md primero para entender el contexto
2. **SIGUE** las convenciones de código establecidas
3. **USA** TypeScript strict mode sin `any`
4. **IMPLEMENTA** tests para nuevo código
5. **DOCUMENTA** funciones complejas con JSDoc
6. **VALIDA** inputs antes de procesar
7. **MANEJA** errores apropiadamente
8. **LOGA** operaciones importantes
9. **CONSIDERA** seguridad en cada cambio
10. **PREGUNTA** si algo no está claro

### Prompts Útiles para Claude Code

```bash
# Implementar nueva herramienta MCP
"Añade una nueva herramienta MCP llamada 'get_neo4j_indexes' que liste 
todos los índices de la base de datos. Sigue el patrón de las herramientas 
existentes en src/mcp/tools.ts y handlers.ts"

# Debugging
"Analiza por qué la query Cypher está fallando con error 'Invalid syntax'. 
El código está en src/neo4j/client.ts línea 45"

# Refactoring
"Refactoriza src/auth/crypto.ts para usar Web Crypto API con AES-GCM 
en lugar de btoa/atob. Mantén la misma interfaz pública"

# Testing
"Crea tests unitarios para Neo4jClient en test/unit/neo4j.test.ts. 
Mockea las llamadas fetch usando vitest"

# Documentation
"Documenta la función getSchema() en src/neo4j/schema.ts con JSDoc, 
explicando parámetros, retorno y ejemplos de uso"
```

---

## 📝 Notas Adicionales

### Limitaciones Conocidas

1. **No WebSocket en Workers** - Por eso usamos HTTP/SSE
2. **No Bolt Protocol** - Neo4j Driver requiere TCP, usamos HTTP API
3. **Cold starts** - Primera request puede ser más lenta
4. **CPU limit** - Workers tienen límite de 50ms CPU time (pero I/O no cuenta)
5. **Memory limit** - 128MB por request

### Best Practices Específicas

1. **Minimizar CPU usage** - Cloudflare cobra por CPU time
2. **Usar KV para caché** - Reduce calls a D1 y Neo4j
3. **Batch operations** - Agrupar queries cuando sea posible
4. **Async todo** - No bloquear el event loop
5. **Validar early** - Fallar rápido en validación

### Performance Tips

- Schema caching: 5 minutos en KV
- Session validation: 1 minuto en KV
- Connection pooling: No disponible, optimizar requests
- Query timeouts: 30 segundos default
- Rate limiting: 100 req/min por usuario

---

**Última actualización:** Diciembre 2024  
**Versión:** 1.0  
**Mantenedor:** Claude Code + Antonio
