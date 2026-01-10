# Claude.md - MCP Neo4j Cypher Server en Cloudflare Workers

## Descripcion del Proyecto

Servidor MCP (Model Context Protocol) que permite a usuarios de Claude.ai conectar sus propias instancias de Neo4j Aura y ejecutar consultas Cypher mediante lenguaje natural. Desplegado en Cloudflare Workers como infraestructura serverless.

**Objetivo:** Crear un puente entre Claude.ai y Neo4j que permita:
- Extraer el esquema de bases de datos Neo4j
- Ejecutar queries Cypher de lectura y escritura
- Gestionar multiples usuarios con sus propias conexiones
- Mantener seguridad y aislamiento entre usuarios

**Producto Final:** Un endpoint HTTPS que Claude.ai consume via protocolo MCP, permitiendo conversaciones como:
```
Usuario: "Que contiene mi base de datos Neo4j?"
Claude: [Usa get_neo4j_schema] "Tu BD tiene labels: Person, Movie..."

Usuario: "Muestrame 5 peliculas"
Claude: [Usa read_neo4j_cypher] MATCH (m:Movie)... [Resultados]
```

**URL Produccion:** `https://mcp-neo4j-cypher.ops-e1a.workers.dev`

---

## Arquitectura del Sistema

### Stack Tecnologico

```yaml
Runtime: Cloudflare Workers (V8 Engine)
Lenguaje: TypeScript 5.3+
Transporte: HTTP/SSE (Server-Sent Events)
Protocolo: JSON-RPC 2.0 (MCP spec 2024-11-05)
Storage:
  - D1 (SQLite): Usuarios y conexiones
  - KV: Sesiones, cache de schema, rate limiting
  - Secrets: Claves de encriptacion
Base de datos: Neo4j Aura (HTTP API)
Seguridad: AES-256-GCM para credenciales, tokens de sesion
```

### Diagrama de Arquitectura

```
+----------------------------------------------------------------+
|                      CLAUDE.AI CLIENT                          |
|  MCP Host ejecutando en browser/desktop                        |
+---------------------------+------------------------------------+
                            | HTTPS POST (JSON-RPC 2.0)
                            v
+----------------------------------------------------------------+
|            CLOUDFLARE WORKER (Edge Computing)                  |
|  +----------------------------------------------------------+  |
|  |  Entry Point (src/index.ts)                              |  |
|  |  - CORS handling                                         |  |
|  |  - Route dispatching                                     |  |
|  |  - Rate limiting                                         |  |
|  +------------------------+---------------------------------+  |
|                           |                                    |
|  +------------------------v---------------------------------+  |
|  |  MCP Protocol Layer (src/mcp/)                           |  |
|  |  - JSON-RPC 2.0 parsing                                  |  |
|  |  - Method routing (initialize, tools/list, tools/call)   |  |
|  |  - Error handling                                        |  |
|  +------------------------+---------------------------------+  |
|                           |                                    |
|  +------------------------v---------------------------------+  |
|  |  Authentication Layer (src/auth/)                        |  |
|  |  - Token validation                                      |  |
|  |  - User resolution                                       |  |
|  |  - Session management (KV)                               |  |
|  +------------------------+---------------------------------+  |
|                           |                                    |
|  +------------------------v---------------------------------+  |
|  |  Security Layer (src/security/)                          |  |
|  |  - Query validation                                      |  |
|  |  - Rate limiting                                         |  |
|  |  - Audit logging                                         |  |
|  +------------------------+---------------------------------+  |
|                           |                                    |
|  +------------------------v---------------------------------+  |
|  |  Neo4j Client (src/neo4j/)                               |  |
|  |  - HTTP API connection                                   |  |
|  |  - Query execution                                       |  |
|  |  - Result transformation                                 |  |
|  +------------------------+---------------------------------+  |
|                           |                                    |
|  +------------------------v---------------------------------+  |
|  |  Storage Layer                                           |  |
|  |  - D1: Users & Connections (encrypted)                   |  |
|  |  - KV: Sessions, Cache & Rate Limits                     |  |
|  +----------------------------------------------------------+  |
+------------------------+---------------------------------------+
                         | HTTPS (Neo4j HTTP API)
                         v
+----------------------------------------------------------------+
|                   NEO4J AURA (User's DB)                       |
|  - neo4j+s://xxx.databases.neo4j.io                            |
|  - User-specific credentials                                   |
|  - Isolated per user                                           |
+----------------------------------------------------------------+
```

### Flujo de una Request MCP

```
1. Claude.ai envia:
   POST /mcp
   Authorization: Bearer <session_token>
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "tools/call",
     "params": {
       "name": "read_neo4j_cypher",
       "arguments": { "query": "MATCH (n) RETURN n LIMIT 5" }
     }
   }

2. Worker aplica rate limiting (KV)
3. Worker valida token -> obtiene user_id (KV)
4. Worker obtiene conexion Neo4j del usuario desde D1
5. Worker desencripta credenciales (AES-256-GCM)
6. Security layer valida query (bloquea operaciones peligrosas)
7. Neo4jClient ejecuta query via HTTP API
8. Worker sanitiza y trunca resultados
9. Audit log registra operacion
10. Worker responde:
   {
     "jsonrpc": "2.0",
     "id": 1,
     "result": {
       "content": [{ "type": "text", "text": "..." }]
     }
   }
```

---

## Estructura de Archivos del Proyecto

```
mcp-neo4j-cypher-cf/
├── src/
│   ├── index.ts                 # Entry point principal
│   ├── types.ts                 # TypeScript interfaces y types
│   │
│   ├── mcp/                     # Capa del protocolo MCP
│   │   ├── protocol.ts          # Parser JSON-RPC 2.0, routing
│   │   ├── tools.ts             # Definiciones de herramientas MCP
│   │   └── handlers.ts          # Implementacion de herramientas
│   │
│   ├── neo4j/                   # Cliente Neo4j HTTP
│   │   ├── client.ts            # Conexion HTTP API
│   │   ├── schema.ts            # Extraccion de schema
│   │   ├── queries.ts           # Ejecucion de queries
│   │   └── types.ts             # Types especificos Neo4j
│   │
│   ├── auth/                    # Autenticacion y seguridad
│   │   ├── session.ts           # Gestion de sesiones (KV)
│   │   ├── crypto.ts            # AES-GCM encrypt/decrypt
│   │   └── middleware.ts        # Middleware de autenticacion
│   │
│   ├── security/                # Seguridad y hardening
│   │   ├── ratelimit.ts         # Rate limiting (KV)
│   │   ├── query-validator.ts   # Validacion de queries Cypher
│   │   ├── audit.ts             # Logging de seguridad
│   │   └── index.ts             # Re-exports
│   │
│   ├── storage/                 # Capa de persistencia
│   │   ├── users.ts             # CRUD usuarios (D1)
│   │   ├── connections.ts       # CRUD conexiones (D1)
│   │   └── cache.ts             # Cache de schema (KV)
│   │
│   ├── api/                     # API endpoints
│   │   ├── setup.ts             # Handlers de configuracion
│   │   └── tokens.ts            # Gestion de tokens
│   │
│   ├── config/                  # Configuracion
│   │   ├── constants.ts         # Constantes del sistema
│   │   └── ui.ts                # HTML para pagina de setup
│   │
│   └── utils/                   # Utilidades
│       ├── cors.ts              # Headers CORS
│       ├── errors.ts            # Clases de error tipadas
│       ├── sanitize.ts          # Sanitizacion de datos
│       ├── tokens.ts            # Truncado por tokens
│       └── logger.ts            # Logging estructurado
│
├── test/                        # Tests (144 tests)
│   ├── setup.ts                 # Mocks para Cloudflare bindings
│   ├── unit/
│   │   ├── sanitize.test.ts     # 20 tests
│   │   ├── tokens.test.ts       # 14 tests
│   │   ├── crypto.test.ts       # 21 tests
│   │   ├── protocol.test.ts     # 25 tests
│   │   ├── neo4j-client.test.ts # 11 tests
│   │   └── security.test.ts     # 38 tests
│   └── integration/
│       └── mcp.test.ts          # 13 tests
│
├── docs/                        # Documentacion
│   ├── DEPLOYMENT.md            # Guia de deploy
│   ├── SECURITY.md              # Documentacion de seguridad
│   └── API.md                   # Referencia de API
│
├── .github/workflows/           # CI/CD
│   ├── ci.yml                   # Tests en cada push/PR
│   ├── deploy-staging.yml       # Deploy automatico a staging
│   └── deploy-production.yml    # Deploy a produccion
│
├── wrangler.toml                # Configuracion Cloudflare Workers
├── schema.sql                   # Schema D1 database
├── package.json
├── tsconfig.json
├── vitest.config.ts             # Configuracion de tests
└── README.md
```

---

## Configuracion Inicial

### Prerequisitos

```bash
# Node.js 18+
node --version  # v18.0.0+

# Wrangler CLI
npm install -g wrangler
wrangler --version

# Autenticacion Cloudflare
wrangler login
```

### Setup del Proyecto

```bash
# Clonar proyecto
git clone <repository-url>
cd mcp-neo4j-cypher-cf

# Instalar dependencias
npm install

# Crear infraestructura Cloudflare
wrangler d1 create mcp-neo4j-users
wrangler kv:namespace create "SESSIONS"

# Aplicar schema D1
wrangler d1 execute mcp-neo4j-users --file=schema.sql --remote

# Configurar secrets
openssl rand -base64 32 | wrangler secret put ENCRYPTION_KEY
```

### Variables de Entorno

Configurar en `wrangler.toml`:

```toml
[vars]
ENVIRONMENT = "development"
DEFAULT_READ_TIMEOUT = "30"
DEFAULT_TOKEN_LIMIT = "10000"
DEFAULT_SCHEMA_SAMPLE = "1000"

# Secrets (usar wrangler secret put):
# - ENCRYPTION_KEY
```

---

## Guias de Desarrollo

### Comandos Principales

```bash
# Desarrollo local con live reload
npm run dev

# Deploy a produccion
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
wrangler kv:key list --binding=SESSIONS
```

### Workflow de Desarrollo Tipico

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
   curl -X POST http://localhost:8787/mcp \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":1,"method":"initialize"}'
   ```

4. **Deploy a staging:**
   ```bash
   wrangler deploy --env staging
   ```

5. **Deploy a produccion:**
   ```bash
   wrangler deploy
   ```

---

## Patrones de Codigo y Convenciones

### TypeScript Types

**SIEMPRE** definir tipos explicitos. NO usar `any`.

```typescript
// CORRECTO
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

// INCORRECTO
async function getConnection(userId: any, env: any): Promise<any> {
  // NO hacer esto
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

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}
```

### Async/Await

**SIEMPRE** usar async/await, NUNCA `.then()`:

```typescript
// CORRECTO
async function fetchData(url: string): Promise<Data> {
  const response = await fetch(url);
  const data = await response.json();
  return data;
}

// INCORRECTO - No usar .then()
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
export function info(message: string, metadata?: Record<string, unknown>): void;
export function warn(message: string, metadata?: Record<string, unknown>): void;
export function error(message: string, metadata?: Record<string, unknown>): void;
export function debug(message: string, metadata?: Record<string, unknown>): void;

// Uso:
logger.info('User authenticated', { userId: user.id });
logger.error('Neo4j query failed', {
  userId: user.id,
  query: query.substring(0, 100),
  error: error.message
});
```

### Manejo de Secrets

NUNCA hardcodear secrets:

```typescript
// CORRECTO
const encryptionKey = env.ENCRYPTION_KEY;
const encrypted = await encrypt(data, encryptionKey);

// INCORRECTO
const encrypted = await encrypt(data, 'my-secret-key-12345');
```

---

## Seguridad

### Encriptacion de Credenciales

Las credenciales Neo4j se encriptan con AES-256-GCM antes de almacenar en D1:

```typescript
// src/auth/crypto.ts
export async function encrypt(plaintext: string, key: string): Promise<string>;
export async function decrypt(ciphertext: string, key: string): Promise<string>;

// Formato almacenado: iv:ciphertext (base64)
// IV unico de 12 bytes por cada encriptacion
```

### Validacion de Queries Cypher

El sistema bloquea operaciones peligrosas automaticamente:

```typescript
// src/security/query-validator.ts
// Operaciones bloqueadas:
- DROP DATABASE, DROP CONSTRAINT, DROP INDEX
- CREATE USER, ALTER USER, DROP USER
- GRANT, REVOKE, DENY
- CALL dbms.* (procedures del sistema)
- LOAD CSV desde URLs remotas (http://, https://, ftp://)

// Validaciones adicionales:
- Longitud maxima: 100KB
- Warning para queries sin LIMIT
- Sanitizacion de parametros
```

### Rate Limiting

Implementado con fixed window algorithm en KV:

```typescript
// src/security/ratelimit.ts
// Configuracion default: 100 requests por minuto
// Identificacion: userId > CF-Connecting-IP > X-Forwarded-For

// Headers de respuesta:
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 45

// Respuesta 429 si excede:
{
  "error": "Too Many Requests",
  "message": "Rate limit exceeded. Try again in 45 seconds.",
  "retryAfter": 45
}
```

### Audit Logging

Eventos registrados automaticamente:

```typescript
// src/security/audit.ts
// Eventos:
- auth_success, auth_failure, session_expired
- rate_limit_exceeded
- query_executed, query_blocked
- setup_attempt, setup_success, setup_failure
- suspicious_activity

// Formato JSON estructurado con:
- timestamp, eventType, requestId
- userId, clientIp, userAgent
- Datos sensibles enmascarados
```

### CORS Seguro

```typescript
// src/utils/cors.ts
// Origenes permitidos por defecto:
- https://claude.ai
- https://www.claude.ai

// Configurable via ALLOWED_ORIGINS en wrangler.toml
```

---

## Testing

### Framework: Vitest

**Total: 144 tests pasando**

```bash
# Ejecutar todos los tests
npm test

# Con coverage
npm test -- --coverage

# Watch mode
npm test -- --watch

# Test especifico
npm test -- test/unit/security.test.ts
```

### Estructura de Tests

| Archivo | Tests | Descripcion |
|---------|-------|-------------|
| `sanitize.test.ts` | 20 | Sanitizacion de datos |
| `tokens.test.ts` | 14 | Truncado por tokens |
| `crypto.test.ts` | 21 | Encriptacion AES-GCM |
| `protocol.test.ts` | 25 | Parser JSON-RPC 2.0 |
| `neo4j-client.test.ts` | 11 | Cliente Neo4j HTTP |
| `security.test.ts` | 38 | Rate limit, query validation |
| `mcp.test.ts` | 13 | Integracion MCP |

### Mocks

```typescript
// test/setup.ts
// Mocks para Cloudflare bindings:
- KVNamespace (get, put, delete, list)
- D1Database (prepare, bind, first, all, run)
```

---

## Deploy y CI/CD

### Ambientes

| Ambiente | Worker | Rama | URL |
|----------|--------|------|-----|
| Dev | `mcp-neo4j-cypher-dev` | `develop` | `https://mcp-neo4j-cypher-dev.ops-e1a.workers.dev` |
| Staging | `mcp-neo4j-cypher-staging` | `main` | `https://mcp-neo4j-cypher-staging.ops-e1a.workers.dev` |
| Produccion | `mcp-neo4j-cypher` | manual | `https://mcp-neo4j-cypher.ops-e1a.workers.dev` |

### Recursos Cloudflare

**Produccion:**
- D1 Database: `mcp-neo4j-users-prod` (ID: `5493f001-14a4-496a-bfc5-60a24ceb7101`)
- KV Namespace: `SESSIONS` (ID: `babfaa9da1d147069b6a0e2b7328c2ca`)

**Staging:**
- D1 Database: `mcp-neo4j-users-staging` (ID: `86365e3f-ce97-4708-be5f-1dec9830055f`)
- KV Namespace: `SESSIONS` (ID: `e6434d88904c4f09b457d934841719ac`)

**Dev:**
- D1 Database: `mcp-neo4j-users-dev` (ID: `e8e6fc3f-673a-4698-a4d7-8fe964cd87ae`)
- KV Namespace: `SESSIONS` (ID: `29f46c6580a34c0e9af149901e0e1101`)

### GitHub Actions (CI/CD)

| Workflow | Trigger | Accion |
|----------|---------|--------|
| `ci.yml` | Push/PR a main | Tests + typecheck |
| `deploy-dev.yml` | Push a develop | Deploy automatico a dev |
| `deploy-staging.yml` | Push a main | Deploy automatico a staging |
| `deploy-production.yml` | Manual/Release | Deploy a produccion |

**Requisito:** Configurar `CLOUDFLARE_API_TOKEN` en GitHub repository secrets.

### Deploy Manual

```bash
# Dev
wrangler deploy --env dev

# Staging
wrangler deploy --env staging

# Production
wrangler deploy --env production
```

---

## Estado del Proyecto

### Fases Completadas

| Fase | Descripcion | Estado |
|------|-------------|--------|
| 1 | Fundamentos (MVP Core) | Completado |
| 2 | Protocolo MCP | Completado |
| 3 | Cliente Neo4j HTTP | Completado |
| 4 | Sanitizacion y Tokens | Completado |
| 5 | Autenticacion y Storage | Completado |
| 6 | Integracion Completa | Completado |
| 7 | UI de Configuracion | Completado |
| 8 | Testing (144 tests) | Completado |
| 9 | Seguridad y Hardening | Completado |
| 10 | Documentacion y Deploy | Completado |

### Roadmaps

- **Completados:** `roadmaps/Roadmap_v1.md` - Implementacion inicial
- **En progreso:** `Roadmap_v2.md` - Optimizacion de operaciones KV

### Proximas Mejoras (Roadmap v2)

- [ ] Reducir operaciones KV por request
- [ ] Cache in-memory del Worker
- [ ] Optimizacion de rate limiting

### Features Futuras (No planificadas)

- OAuth 2.1 (Google/GitHub)
- Multi-database por usuario
- Query history
- Admin dashboard

---

## Referencias y Recursos

### Documentacion Oficial

- [Model Context Protocol Spec](https://modelcontextprotocol.io/docs/specification)
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Cloudflare D1 Docs](https://developers.cloudflare.com/d1/)
- [Cloudflare KV Docs](https://developers.cloudflare.com/kv/)
- [Neo4j HTTP API](https://neo4j.com/docs/http-api/current/)
- [Neo4j Aura](https://neo4j.com/cloud/aura/)

### Documentacion del Proyecto

- `docs/DEPLOYMENT.md` - Guia completa de deploy
- `docs/SECURITY.md` - Medidas de seguridad
- `docs/API.md` - Referencia de API

---

## Troubleshooting

### Errores Comunes

**Error:** `D1_ERROR: no such table: users`
```bash
# Solucion: Aplicar schema
wrangler d1 execute mcp-neo4j-users --file=schema.sql --remote
```

**Error:** `KV binding 'SESSIONS' not found`
```bash
# Solucion: Verificar wrangler.toml tiene el binding correcto
[[kv_namespaces]]
binding = "SESSIONS"
id = "tu_namespace_id"
```

**Error:** `Neo4j HTTP Error: 401 Unauthorized`
```bash
# Solucion: Verificar credenciales Neo4j
# Las credenciales estan encriptadas en D1
# Revisar que ENCRYPTION_KEY no haya cambiado
```

**Error:** `TypeError: env.ENCRYPTION_KEY is undefined`
```bash
# Solucion: Configurar secret
openssl rand -base64 32 | wrangler secret put ENCRYPTION_KEY
```

**Error:** `Query blocked for security reasons`
```bash
# La query contiene operaciones bloqueadas (DROP, GRANT, etc.)
# Ver docs/SECURITY.md para lista completa
```

---

## Tips para Claude Code

### Cuando trabajes en este proyecto:

1. **SIEMPRE** lee este Claude.md primero para entender el contexto
2. **CONSULTA** el roadmap activo para saber que se esta implementando
3. **SIGUE** las convenciones de codigo establecidas
4. **USA** TypeScript strict mode sin `any`
5. **IMPLEMENTA** tests para nuevo codigo
6. **VALIDA** inputs antes de procesar
7. **MANEJA** errores apropiadamente
8. **LOGA** operaciones importantes con audit
9. **CONSIDERA** seguridad en cada cambio
10. **PREGUNTA** si algo no esta claro

### Estructura de Documentacion

```
Claude.md           <- Este archivo (contexto principal)
Roadmap_v2.md       <- Roadmap activo en implementacion
roadmaps/           <- Roadmaps completados
  Roadmap_v1.md     <- Implementacion inicial (completado)
docs/               <- Documentacion tecnica
  DEPLOYMENT.md
  SECURITY.md
  API.md
```

---

## Limitaciones Conocidas

1. **No WebSocket en Workers** - Por eso usamos HTTP/SSE
2. **No Bolt Protocol** - Neo4j Driver requiere TCP, usamos HTTP API
3. **Cold starts** - Primera request puede ser mas lenta
4. **CPU limit** - Workers tienen limite de 50ms CPU time (pero I/O no cuenta)
5. **Memory limit** - 128MB por request
6. **KV eventually consistent** - Doble verificacion de expiracion implementada

### Performance Tips

- Schema caching: 5 minutos en KV
- Session validation: En KV con TTL 24h
- Rate limiting: Fixed window en KV
- Query timeouts: 30 segundos default
- Rate limit: 100 req/min por usuario

---

**Ultima actualizacion:** Enero 2025
**Version:** 2.0
**Mantenedor:** Claude Code + Usuario
