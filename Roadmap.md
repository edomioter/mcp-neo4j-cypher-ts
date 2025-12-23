# Roadmap - MCP Neo4j Cypher Server para Cloudflare Workers

## Documento de Contexto y Hoja de Ruta del Proyecto

**Fecha de inicio:** Diciembre 2025
**Última actualización:** 2025-12-23
**Versión del documento:** 1.1

---

## 1. Resumen Ejecutivo

### 1.1 Objetivo del Proyecto

Adaptar el servidor MCP `mcp-neo4j-cypher` (originalmente en Python) a **TypeScript** para ejecutarse en **Cloudflare Workers**, permitiendo a usuarios de Claude.ai conectar sus bases de datos Neo4j Aura y ejecutar consultas Cypher mediante lenguaje natural.

### 1.2 Servidor Original Analizado

- **Repositorio:** https://github.com/neo4j-contrib/mcp-neo4j
- **Ruta:** `servers/mcp-neo4j-cypher`
- **Versión analizada:** 0.5.2
- **Lenguaje:** Python 3.10+
- **Framework MCP:** fastmcp v2.10.5
- **Driver Neo4j:** neo4j v5.26.0

### 1.3 Diferencias Clave de la Adaptación

| Aspecto | Original (Python) | Adaptación (TypeScript) |
|---------|-------------------|-------------------------|
| Runtime | Python 3.10+ | Cloudflare Workers (V8) |
| Transporte | STDIO/SSE/HTTP | HTTP/SSE únicamente |
| Driver Neo4j | Bolt Protocol | HTTP API (Neo4j Query API) |
| Storage | Variables locales | D1 (SQLite) + KV |
| Autenticación | Variables de entorno | Tokens + OAuth (multi-usuario) |
| Despliegue | Docker/Local | Serverless (Cloudflare) |

---

## 2. Análisis del Servidor Original

### 2.1 Estructura de Archivos (Python)

```
mcp-neo4j-cypher/
├── src/mcp_neo4j_cypher/
│   ├── __init__.py      # Entry point, argparse, main()
│   ├── server.py        # Servidor MCP, herramientas, conexión Neo4j
│   └── utils.py         # Sanitización, truncado tokens, configuración
├── tests/
├── pyproject.toml
└── Dockerfile
```

### 2.2 Herramientas MCP Implementadas

#### 2.2.1 `get_neo4j_schema`
```python
@mcp.tool
def get_neo4j_schema(sample_size: int = default_sample_size) -> str:
    """
    Recupera el schema de la base de datos Neo4j.
    - Usa: CALL apoc.meta.schema({sample: N})
    - Retorna: Labels, propiedades (tipo, índices), relaciones
    """
```

**Parámetros:**
- `sample_size` (int, default: 1000): Nodos a muestrear para inferir schema

**Lógica:**
1. Ejecuta `CALL apoc.meta.schema({sample: N})`
2. Procesa respuesta JSON con nodos y relaciones
3. Limpia datos innecesarios (embeddings, listas largas)
4. Retorna estructura JSON sanitizada

#### 2.2.2 `read_neo4j_cypher`
```python
@mcp.tool
def read_neo4j_cypher(query: str, params: dict = None) -> str:
    """
    Ejecuta consultas Cypher de solo lectura.
    - Routing: READ
    - Timeout configurable (default: 30s)
    - Trunca resultados por límite de tokens
    """
```

**Parámetros:**
- `query` (str, requerido): Consulta Cypher
- `params` (dict, opcional): Parámetros para la consulta

**Lógica:**
1. Ejecuta query con `RoutingControl.READ`
2. Sanitiza resultados (elimina embeddings, listas >128 elementos)
3. Trunca a límite de tokens configurado
4. Retorna JSON con resultados

#### 2.2.3 `write_neo4j_cypher`
```python
@mcp.tool
def write_neo4j_cypher(query: str, params: dict = None) -> str:
    """
    Ejecuta consultas Cypher de escritura.
    - Routing: WRITE
    - Solo disponible si allow_writes=True
    - Retorna contadores de operaciones
    """
```

**Parámetros:**
- `query` (str, requerido): Consulta Cypher
- `params` (dict, opcional): Parámetros para la consulta

**Lógica:**
1. Valida que escrituras estén habilitadas
2. Ejecuta query con `RoutingControl.WRITE`
3. Retorna contadores: nodes_created, relationships_created, etc.

### 2.3 Funciones de Utilidad

#### 2.3.1 `_value_sanitize()`
Elimina datos irrelevantes para optimizar contexto LLM:
- Filtra listas > 128 elementos
- Elimina valores de embedding
- Procesa estructuras anidadas recursivamente
- Elimina valores `None`

#### 2.3.2 `_truncate_string_to_tokens()`
Limita texto a máximo de tokens:
- Usa `tiktoken` con modelo "gpt-4"
- Codifica texto, trunca tokens excedentes
- Decodifica resultado truncado

#### 2.3.3 `parse_boolean_safely()`
Valida conversión a booleano:
- Acepta `bool` directo
- Acepta strings "true"/"false" (case-insensitive)
- Lanza `ValueError` para valores inválidos

#### 2.3.4 `process_config()`
Procesa configuración con jerarquía:
1. Argumentos CLI (prioridad máxima)
2. Variables de entorno
3. Valores por defecto

### 2.4 Configuración Original

| Parámetro | Variable Entorno | Default | Descripción |
|-----------|------------------|---------|-------------|
| `--transport` | - | stdio | Protocolo: stdio/http/sse |
| `--host` | - | 127.0.0.1 | Host del servidor |
| `--port` | - | 8000 | Puerto del servidor |
| `--neo4j-url` | `NEO4J_URI` | - | URI de conexión Neo4j |
| `--neo4j-username` | `NEO4J_USERNAME` | neo4j | Usuario Neo4j |
| `--neo4j-password` | `NEO4J_PASSWORD` | - | Contraseña Neo4j |
| `--neo4j-database` | `NEO4J_DATABASE` | neo4j | Base de datos |
| `--read-timeout` | `NEO4J_READ_TIMEOUT` | 30 | Timeout consultas (seg) |
| `--token-limit` | `NEO4J_RESPONSE_TOKEN_LIMIT` | - | Límite tokens respuesta |
| `--sample` | `NEO4J_SCHEMA_SAMPLE_SIZE` | 1000 | Muestreo para schema |
| `--read-only` | - | false | Deshabilitar escrituras |
| `--namespace` | - | - | Prefijo herramientas |

---

## 3. Arquitectura de la Adaptación

### 3.1 Stack Tecnológico Final

```yaml
Runtime: Cloudflare Workers (V8 Engine)
Lenguaje: TypeScript 5.3+
Transporte: HTTP/SSE (Server-Sent Events)
Protocolo: JSON-RPC 2.0 (MCP spec 2024-11-05)
Storage:
  - D1 (SQLite): Usuarios, conexiones, configuraciones
  - KV: Sesiones, caché de schema
  - Secrets: Claves de encriptación
Base de datos: Neo4j Aura (HTTP Query API)
Seguridad: AES-GCM para credenciales, tokens de sesión
```

### 3.2 Estructura de Archivos Objetivo

```
mcp-neo4j-cypher-cf/
├── src/
│   ├── index.ts                 # Entry point, router principal
│   ├── types.ts                 # Interfaces y types TypeScript
│   │
│   ├── mcp/                     # Capa del protocolo MCP
│   │   ├── protocol.ts          # Parser JSON-RPC 2.0, routing
│   │   ├── tools.ts             # Definiciones de herramientas
│   │   └── handlers.ts          # Implementación de herramientas
│   │
│   ├── neo4j/                   # Cliente Neo4j HTTP
│   │   ├── client.ts            # Conexión HTTP API
│   │   ├── schema.ts            # Extracción de schema
│   │   ├── queries.ts           # Ejecución de queries
│   │   └── types.ts             # Types específicos Neo4j
│   │
│   ├── auth/                    # Autenticación y seguridad
│   │   ├── session.ts           # Gestión de sesiones (KV)
│   │   ├── crypto.ts            # AES-GCM encrypt/decrypt
│   │   └── middleware.ts        # Middleware de autenticación
│   │
│   ├── storage/                 # Capa de persistencia
│   │   ├── users.ts             # CRUD usuarios (D1)
│   │   ├── connections.ts       # CRUD conexiones (D1)
│   │   └── cache.ts             # Caché de schema (KV)
│   │
│   ├── config/                  # Configuración
│   │   ├── constants.ts         # Constantes del sistema
│   │   └── ui.ts                # HTML página de setup
│   │
│   └── utils/                   # Utilidades
│       ├── cors.ts              # Headers CORS
│       ├── errors.ts            # Clases de error tipadas
│       ├── sanitize.ts          # Sanitización de datos
│       ├── tokens.ts            # Truncado por tokens
│       └── logger.ts            # Logging estructurado
│
├── test/
│   ├── unit/
│   │   ├── neo4j-client.test.ts
│   │   ├── mcp-protocol.test.ts
│   │   ├── auth.test.ts
│   │   └── sanitize.test.ts
│   └── integration/
│       └── e2e.test.ts
│
├── wrangler.toml                # Configuración Cloudflare
├── schema.sql                   # Schema D1
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

### 3.3 Neo4j HTTP API vs Bolt Protocol

El servidor original usa el **Bolt Protocol** mediante el driver oficial. En Cloudflare Workers no hay TCP sockets, por lo que usaremos la **Neo4j HTTP Query API**.

**Endpoint:** `https://{instance}.databases.neo4j.io/db/{database}/query/v2`

**Request:**
```json
{
  "statement": "MATCH (n:Person) RETURN n.name LIMIT 10",
  "parameters": {},
  "includeCounters": true
}
```

**Response:**
```json
{
  "data": {
    "fields": ["n.name"],
    "values": [["Alice"], ["Bob"]]
  },
  "counters": {
    "nodesCreated": 0,
    "relationshipsCreated": 0
  }
}
```

**Autenticación:** Basic Auth (base64 de `username:password`)

---

## 4. Fases de Desarrollo

### FASE 1: Fundamentos (MVP Core)
**Estado:** COMPLETADA
**Prioridad:** Alta
**Fecha completado:** 2025-12-22

#### 1.1 Inicialización del Proyecto
- [x] Crear estructura de carpetas
- [x] Configurar `package.json` con dependencias
- [x] Configurar `tsconfig.json` (strict mode)
- [x] Configurar `wrangler.toml` base
- [x] Crear `schema.sql` para D1

**Archivos creados:**
- `package.json`
- `tsconfig.json`
- `wrangler.toml`
- `schema.sql`
- `src/types.ts`

#### 1.2 Types e Interfaces Base
- [x] Definir `Env` (bindings Cloudflare)
- [x] Definir interfaces MCP (Request, Response, Tool)
- [x] Definir interfaces Neo4j (Connection, QueryResult)
- [x] Definir interfaces de usuario y sesión

**Archivo:** `src/types.ts`

#### 1.3 Entry Point y Router
- [x] Implementar handler principal `fetch()`
- [x] Routing básico: `/sse`, `/health`, `/setup`
- [x] Manejo de CORS
- [x] Manejo de errores global

**Archivo:** `src/index.ts`

#### 1.4 Utilidades Base
- [x] Implementar `cors.ts` (headers CORS seguros)
- [x] Implementar `errors.ts` (clases de error tipadas)
- [x] Implementar `logger.ts` (logging estructurado JSON)

**Archivos:**
- `src/utils/cors.ts`
- `src/utils/errors.ts`
- `src/utils/logger.ts`

---

### FASE 2: Protocolo MCP
**Estado:** COMPLETADA
**Prioridad:** Alta
**Fecha completado:** 2025-12-22

#### 2.1 Parser JSON-RPC 2.0
- [x] Validar estructura JSON-RPC
- [x] Extraer method, params, id
- [x] Generar respuestas de error estándar
- [ ] Implementar batch requests (opcional - pospuesto)

**Archivo:** `src/mcp/protocol.ts`

#### 2.2 Handlers MCP Core
- [x] `initialize` - Handshake inicial
- [x] `initialized` - Confirmación
- [x] `tools/list` - Listar herramientas
- [x] `tools/call` - Ejecutar herramienta

**Archivo:** `src/mcp/handlers.ts`

#### 2.3 Definición de Herramientas
- [x] Definir `get_neo4j_schema` (metadata)
- [x] Definir `read_neo4j_cypher` (metadata)
- [x] Definir `write_neo4j_cypher` (metadata)
- [x] JSON Schema para parámetros

**Archivo:** `src/mcp/tools.ts`

---

### FASE 3: Cliente Neo4j HTTP
**Estado:** COMPLETADA
**Prioridad:** Alta
**Fecha completado:** 2025-12-22

#### 3.1 Cliente HTTP Base
- [x] Convertir URI Neo4j a HTTP URL
- [x] Implementar autenticación Basic Auth
- [x] Ejecutar queries via POST
- [x] Parsear respuestas
- [x] Manejo de errores Neo4j

**Archivo:** `src/neo4j/client.ts`

#### 3.2 Types Neo4j
- [x] `Neo4jNode`, `Neo4jRelationship`
- [x] `Neo4jQueryResult`, `Neo4jCounters`
- [x] `Neo4jError`, `Neo4jSchema`

**Archivo:** `src/neo4j/types.ts`

#### 3.3 Extracción de Schema
- [x] Query APOC meta.schema (con fallback)
- [x] Procesar labels y propiedades
- [x] Extraer relaciones
- [x] Formatear para LLM

**Archivo:** `src/neo4j/schema.ts`

#### 3.4 Ejecución de Queries
- [x] Ejecutar query READ
- [x] Ejecutar query WRITE
- [x] Validar tipo de query
- [x] Timeout configurable
- [x] Retornar counters para writes

**Archivo:** `src/neo4j/queries.ts`

---

### FASE 4: Sanitización y Tokens
**Estado:** COMPLETADA
**Prioridad:** Media
**Fecha completado:** 2025-12-23

#### 4.1 Sanitización de Datos
- [x] Filtrar listas > 128 elementos
- [x] Eliminar embeddings
- [x] Procesar estructuras anidadas
- [x] Eliminar valores null/undefined

**Archivo:** `src/utils/sanitize.ts`

#### 4.2 Truncado por Tokens
- [x] Implementar contador de tokens (aproximado)
- [x] Truncar strings al límite
- [x] Alternativa a tiktoken para Workers

**Archivo:** `src/utils/tokens.ts`

**Nota:** Implementado usando aproximación de ~4 caracteres por token (configurable). Incluye búsqueda binaria para truncado eficiente de arrays.

---

### FASE 5: Autenticación y Storage
**Estado:** COMPLETADA
**Prioridad:** Alta
**Fecha completado:** 2025-12-23

#### 5.1 Schema D1
- [x] Tabla `users` (id, email, created_at)
- [x] Tabla `connections` (user_id, neo4j_uri, credentials encriptados)
- [x] Sesiones almacenadas en KV (más eficiente que D1)

**Archivo:** `schema.sql`

#### 5.2 Criptografía
- [x] Implementar AES-GCM encrypt con Web Crypto API
- [x] Implementar AES-GCM decrypt
- [x] Generar IVs únicos (12 bytes)
- [x] Derivar key desde ENCRYPTION_KEY (SHA-256)
- [x] Funciones auxiliares: generateToken, hash, secureCompare

**Archivo:** `src/auth/crypto.ts`

#### 5.3 Gestión de Sesiones
- [x] Generar tokens de sesión (URL-safe, 32 bytes)
- [x] Almacenar en KV con TTL configurable
- [x] Validar tokens con doble verificación de expiración
- [x] Resolver user_id y connectionId desde token
- [x] Refresh y delete de sesiones

**Archivo:** `src/auth/session.ts`

#### 5.4 Middleware de Autenticación
- [x] Extraer token de headers (Authorization, X-Session-Token)
- [x] Validar sesión
- [x] Construir RequestContext con conexión descifrada
- [x] requireAuth y optionalAuth helpers

**Archivo:** `src/auth/middleware.ts`

#### 5.5 Storage D1
- [x] CRUD usuarios completo
- [x] CRUD conexiones con encriptación/desencriptación
- [x] getOrCreateUserByEmail para flujo OAuth
- [x] setActiveConnection para múltiples conexiones
- [x] Queries optimizadas con índices

**Archivos:**
- `src/storage/users.ts`
- `src/storage/connections.ts`

#### 5.6 Caché de Schema (KV)
- [x] Almacenar schema con TTL (5 min default)
- [x] Invalidar caché por connectionId
- [x] getOrFetchSchema helper
- [x] Funciones genéricas de caché: getCached, setCached, deleteCached

**Archivo:** `src/storage/cache.ts`

---

### FASE 6: Integración Completa
**Estado:** COMPLETADA
**Prioridad:** Alta
**Fecha completado:** 2025-12-23

#### 6.1 Flujo Completo tools/call
- [x] Recibir request MCP
- [x] Autenticar usuario (optionalAuth)
- [x] Obtener conexión Neo4j del usuario
- [x] Desencriptar credenciales automáticamente
- [x] Crear Neo4jClient dinámicamente
- [x] Ejecutar herramienta solicitada
- [x] Sanitizar y truncar resultado
- [x] Retornar respuesta MCP

#### 6.2 Implementar get_neo4j_schema
- [x] Obtener conexión del usuario
- [x] Verificar caché KV
- [x] Si no hay caché, consultar Neo4j
- [x] Almacenar en caché (5 min TTL)
- [x] Retornar schema formateado

#### 6.3 Implementar read_neo4j_cypher
- [x] Validar que sea query de lectura
- [x] Ejecutar con timeout configurable
- [x] Sanitizar resultados (embeddings, listas largas)
- [x] Truncar por tokens
- [x] Retornar JSON

#### 6.4 Implementar write_neo4j_cypher
- [x] Verificar que writes estén habilitados (readOnly flag)
- [x] Ejecutar query
- [x] Retornar counters

---

### FASE 7: UI de Configuración
**Estado:** COMPLETADA
**Prioridad:** Media
**Fecha completado:** 2025-12-23

#### 7.1 Página de Setup
- [x] HTML responsive básico
- [x] Formulario de conexión Neo4j
- [x] Validación client-side
- [x] Feedback visual

**Archivo:** `src/config/ui.ts`

#### 7.2 Endpoint de Setup
- [x] `GET /setup` - Mostrar UI
- [x] `POST /setup` - Guardar conexión
- [x] Validar credenciales Neo4j
- [x] Generar token de sesión
- [x] Retornar instrucciones para Claude

#### 7.3 API de Estado
- [x] `GET /api/setup` - Verificar estado de conexión
- [x] `POST /api/setup` - Crear conexión (JSON API)

**Archivos:**
- `src/config/ui.ts`
- `src/api/setup.ts`

---

### FASE 8: Testing
**Estado:** COMPLETADA
**Prioridad:** Media
**Fecha completado:** 2025-12-23

#### 8.1 Unit Tests
- [x] Tests para `sanitize.ts` (20 tests)
- [x] Tests para `tokens.ts` (14 tests)
- [x] Tests para `crypto.ts` (21 tests)
- [x] Tests para `protocol.ts` (25 tests)
- [x] Tests para `neo4j/client.ts` (11 tests)

**Framework:** Vitest

#### 8.2 Integration Tests
- [x] Test flujo MCP completo (13 tests)
- [x] Test handlers sin Neo4j
- [x] Test de autenticación (mocked)

#### 8.3 Configuración Vitest
- [x] `vitest.config.ts`
- [x] Mocks para Cloudflare bindings (KV, D1)
- [x] `test/setup.ts` con helpers

**Total: 106 tests pasando**

**Archivos creados:**
- `vitest.config.ts`
- `test/setup.ts`
- `test/unit/sanitize.test.ts`
- `test/unit/tokens.test.ts`
- `test/unit/crypto.test.ts`
- `test/unit/protocol.test.ts`
- `test/unit/neo4j-client.test.ts`
- `test/integration/mcp.test.ts`

---

### FASE 9: Seguridad y Hardening
**Estado:** COMPLETADA
**Prioridad:** Alta
**Fecha completado:** 2025-12-23

#### 9.1 Rate Limiting
- [x] Límite por usuario (100 req/min configurable)
- [x] Almacenar contadores en KV con sliding window
- [x] Retornar 429 si excede con headers estándar
- [x] Identificación por userId, IP (CF-Connecting-IP, X-Forwarded-For)

**Archivo:** `src/security/ratelimit.ts`

#### 9.2 Validación de Queries
- [x] Detectar queries de escritura en read_cypher
- [x] Bloquear operaciones peligrosas (DROP DATABASE, CREATE USER, GRANT, etc.)
- [x] Bloquear DBMS procedures del sistema
- [x] Bloquear LOAD CSV desde URLs remotas
- [x] Sanitizar parámetros de query
- [x] Validar longitud máxima de query
- [x] Warnings para queries sin LIMIT

**Archivo:** `src/security/query-validator.ts`

#### 9.3 CORS Seguro
- [x] Whitelist de origins (claude.ai, configurable)
- [x] Validar headers (ya implementado en Fase 1)

#### 9.4 Logging de Seguridad (Audit)
- [x] Log de autenticación (success, failure, invalid token, session expired)
- [x] Log de rate limit exceeded
- [x] Log de queries ejecutadas (preview truncado, tipo, tiempo)
- [x] Log de queries bloqueadas (razón, preview)
- [x] Log de setup attempts (success, failure)
- [x] Log de actividad sospechosa
- [x] Máscara de datos sensibles

**Archivo:** `src/security/audit.ts`

#### 9.5 Tests de Seguridad
- [x] Tests para validateQuery (12 tests)
- [x] Tests para isReadOnlyQuery (5 tests)
- [x] Tests para containsWriteOperations (6 tests)
- [x] Tests para sanitizeParameters (4 tests)
- [x] Tests para checkRateLimit (4 tests)
- [x] Tests para getRateLimitIdentifier (4 tests)
- [x] Tests para createRateLimitHeaders (1 test)

**Archivo:** `test/unit/security.test.ts`

**Total: 144 tests pasando (38 nuevos tests de seguridad)**

---

### FASE 10: Documentación y Deploy
**Estado:** COMPLETADA
**Prioridad:** Media
**Fecha completado:** 2025-12-23

#### 10.1 Documentación
- [x] README.md completo con quick start
- [x] Guía de deployment detallada (docs/DEPLOYMENT.md)
- [x] Documentación de seguridad (docs/SECURITY.md)
- [x] API reference completa (docs/API.md)
- [x] Ejemplos de uso (queries Cypher)

**Archivos creados:**
- `README.md` - Visión general y quick start
- `docs/DEPLOYMENT.md` - Guía paso a paso para Cloudflare
- `docs/SECURITY.md` - Rate limiting, queries bloqueadas, encriptación
- `docs/API.md` - HTTP endpoints, MCP tools, ejemplos

#### 10.2 Deploy Staging
- [x] Configurar ambiente staging en wrangler.toml
- [x] Crear recursos D1 y KV en Cloudflare
- [x] Deploy inicial (2025-12-23T19:00:15.180Z)
- [x] Configurar ENCRYPTION_KEY secret
- [x] Deploy con secrets (2025-12-23T19:03:38.603Z)

**Recursos creados:**
- D1 Database: `mcp-neo4j-users-staging` (ID: `b0afd894-f058-4b38-9593-021dc5e1f79e`)
- KV Namespace: `SESSIONS` (ID: `6273d16c007743598a144f6443872e7a`)
- Worker: `mcp-neo4j-cypher-staging`

#### 10.3 Deploy Producción
- [x] Crear recursos D1 y KV de producción
- [x] Actualizar wrangler.toml con IDs de producción
- [x] Configurar secrets (ENCRYPTION_KEY)
- [x] Aplicar schema D1 a producción
- [x] Deploy final (2025-12-23T22:31:00.000Z)
- [x] Ejecutar smoke tests (37/37 pasados)

**Recursos creados:**
- D1 Database: `mcp-neo4j-users-prod` (ID: `40e22b7e-96ca-453d-9263-8fcfa61df034`)
- KV Namespace: `SESSIONS` (ID: `dfd68ab532eb4ccb82289c310eb089af`)
- Worker: `mcp-neo4j-cypher`
- URL: `https://mcp-neo4j-cypher.eduardodominguezotero.workers.dev`

#### 10.4 CI/CD (Pendiente)
- [ ] GitHub Actions para tests
- [ ] GitHub Actions para deploy automático
- [ ] Checks de lint y typecheck

---

## 5. Dependencias del Proyecto

### 5.1 Dependencias de Producción

```json
{
  "dependencies": {}
}
```

**Nota:** Cloudflare Workers no requiere dependencias externas para la mayoría de funcionalidades. Web Crypto API, fetch, etc. están disponibles nativamente.

### 5.2 Dependencias de Desarrollo

```json
{
  "devDependencies": {
    "typescript": "^5.3.0",
    "wrangler": "^3.0.0",
    "@cloudflare/workers-types": "^4.0.0",
    "vitest": "^1.0.0",
    "@types/node": "^20.0.0"
  }
}
```

---

## 6. Configuración del Entorno

### 6.1 wrangler.toml Base

```toml
name = "mcp-neo4j-cypher"
main = "src/index.ts"
compatibility_date = "2025-01-01"

[[d1_databases]]
binding = "DB"
database_name = "mcp-neo4j-users"
database_id = "<ID>"

[[kv_namespaces]]
binding = "SESSIONS"
id = "<ID>"

[vars]
ENVIRONMENT = "development"
DEFAULT_READ_TIMEOUT = "30"
DEFAULT_TOKEN_LIMIT = "10000"
DEFAULT_SCHEMA_SAMPLE = "1000"

# Secrets (usar wrangler secret put):
# - ENCRYPTION_KEY
```

### 6.2 Schema D1 Base

```sql
-- schema.sql
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS connections (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    name TEXT DEFAULT 'default',
    neo4j_uri_encrypted TEXT NOT NULL,
    neo4j_user_encrypted TEXT NOT NULL,
    neo4j_password_encrypted TEXT NOT NULL,
    neo4j_database TEXT DEFAULT 'neo4j',
    read_only INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_connections_user_id ON connections(user_id);
```

---

## 7. Criterios de Aceptación por Fase

### Fase 1: Fundamentos
- [ ] `npm run dev` inicia servidor local sin errores
- [ ] `GET /health` retorna 200 OK
- [ ] TypeScript compila sin errores

### Fase 2: Protocolo MCP
- [ ] `initialize` retorna serverInfo y capabilities
- [ ] `tools/list` retorna 3 herramientas definidas
- [ ] Errores JSON-RPC formateados correctamente

### Fase 3: Cliente Neo4j
- [ ] Conexión exitosa a Neo4j Aura
- [ ] Query simple retorna resultados
- [ ] Errores Neo4j manejados correctamente

### Fase 4: Sanitización
- [ ] Listas >128 elementos filtradas
- [ ] Strings truncados al límite de tokens
- [ ] Estructuras anidadas procesadas

### Fase 5: Autenticación
- [ ] Usuario puede registrar conexión
- [ ] Credenciales encriptadas en D1
- [ ] Token de sesión válido por 24h
- [ ] Requests sin token retornan 401

### Fase 6: Integración
- [ ] `tools/call` con `get_neo4j_schema` funciona
- [ ] `tools/call` con `read_neo4j_cypher` funciona
- [ ] `tools/call` con `write_neo4j_cypher` funciona
- [ ] Caché de schema funciona

### Fase 7: UI
- [ ] Formulario de setup accesible
- [ ] Validación de conexión Neo4j
- [ ] Instrucciones claras para Claude

### Fase 8: Testing
- [ ] >80% coverage en unit tests
- [ ] Tests de integración pasando
- [ ] CI ejecuta tests automáticamente

### Fase 9: Seguridad
- [ ] Rate limiting funciona
- [ ] Queries peligrosas bloqueadas
- [ ] CORS solo permite claude.ai

### Fase 10: Deploy
- [ ] Staging funcionando
- [ ] Producción funcionando
- [ ] Claude.ai puede conectarse

---

## 8. Registro de Progreso

### Historial de Desarrollo

| Fecha | Fase | Actividad | Estado |
|-------|------|-----------|--------|
| 2025-12-22 | 0 | Análisis servidor original | Completado |
| 2025-12-22 | 0 | Creación de Roadmap.md | Completado |
| 2025-12-22 | 1 | Fase 1: Fundamentos (MVP Core) | Completado |
| 2025-12-22 | 2 | Fase 2: Protocolo MCP | Completado |
| 2025-12-22 | 3 | Fase 3: Cliente Neo4j HTTP | Completado |
| 2025-12-23 | 4 | Fase 4: Sanitización y Tokens | Completado |
| 2025-12-23 | 5 | Fase 5: Autenticación y Storage | Completado |
| 2025-12-23 | 6 | Fase 6: Integración Completa | Completado |
| 2025-12-23 | 7 | Fase 7: UI de Configuración | Completado |
| 2025-12-23 | 8 | Fase 8: Testing | Completado |
| 2025-12-23 | 9 | Fase 9: Seguridad y Hardening | Completado |
| 2025-12-23 | 10 | Fase 10: Documentación | Completado |
| 2025-12-23 | 10.2 | Deploy Staging a Cloudflare | Completado |
| 2025-12-23 | 10.3 | Deploy Producción a Cloudflare | Completado |
| | | | |

### Notas de Sesión

#### Sesión 1 - 2025-12-22
- **Actividad:** Análisis inicial del repositorio mcp-neo4j-cypher
- **Hallazgos:**
  - Servidor usa fastmcp como framework MCP
  - 3 herramientas: get_schema, read_cypher, write_cypher
  - Utiliza tiktoken para truncado (no disponible en Workers)
  - APOC requerido para schema (necesario fallback)
- **Próximos pasos:** ~~Iniciar Fase 1~~ COMPLETADO

#### Sesión 1 (continuación) - 2025-12-22
- **Actividad:** Implementación Fase 1 - Fundamentos
- **Archivos creados:**
  - `package.json` - Configuración npm con dependencias
  - `tsconfig.json` - TypeScript strict mode
  - `wrangler.toml` - Configuración Cloudflare Workers
  - `schema.sql` - Schema D1 (users, connections)
  - `src/types.ts` - Interfaces TypeScript completas
  - `src/index.ts` - Entry point con routing
  - `src/config/constants.ts` - Constantes del servidor
  - `src/utils/cors.ts` - Manejo CORS seguro
  - `src/utils/errors.ts` - Clases de error tipadas
  - `src/utils/logger.ts` - Logging estructurado JSON
- **Verificaciones realizadas:**
  - TypeScript compila sin errores
  - Servidor inicia correctamente en localhost:8787
  - Endpoints probados: /health, /setup, /sse (initialize, tools/list)
- **Próximos pasos:** ~~Iniciar Fase 2 (Protocolo MCP)~~ COMPLETADO

#### Sesión 1 (continuación) - 2025-12-22
- **Actividad:** Implementación Fase 2 - Protocolo MCP
- **Archivos creados:**
  - `src/mcp/protocol.ts` - Parser JSON-RPC 2.0 completo
  - `src/mcp/handlers.ts` - Handlers MCP (initialize, tools/list, tools/call)
  - `src/mcp/tools.ts` - Definiciones de las 3 herramientas MCP
- **Funcionalidades implementadas:**
  - Parser JSON-RPC 2.0 con validación completa
  - Handler `initialize` con capabilities
  - Handler `tools/list` con las 3 herramientas definidas
  - Handler `tools/call` con routing a cada herramienta
  - Validación de queries (detección read vs write)
  - Error handling completo (ParseError, InvalidParams, MethodNotFound)
- **Herramientas MCP definidas:**
  - `get_neo4j_schema` - Obtener schema de la BD
  - `read_neo4j_cypher` - Ejecutar queries de lectura
  - `write_neo4j_cypher` - Ejecutar queries de escritura
- **Verificaciones realizadas:**
  - TypeScript compila sin errores
  - Todos los endpoints MCP funcionan correctamente
  - Error handling probado (tool desconocido, método desconocido, JSON inválido)
- **Próximos pasos:** ~~Iniciar Fase 3 (Cliente Neo4j HTTP)~~ COMPLETADO

#### Sesión 1 (continuación) - 2025-12-22
- **Actividad:** Implementación Fase 3 - Cliente Neo4j HTTP
- **Archivos creados:**
  - `src/neo4j/types.ts` - Types completos para Neo4j HTTP API
  - `src/neo4j/client.ts` - Cliente HTTP con conversión URI, auth, timeouts
  - `src/neo4j/schema.ts` - Extracción de schema (APOC + fallback manual)
  - `src/neo4j/queries.ts` - Ejecución de queries read/write
- **Funcionalidades implementadas:**
  - Conversión de URIs Neo4j a HTTP URLs (neo4j+s://, bolt://, etc.)
  - Autenticación Basic Auth con credenciales
  - Ejecución de queries via HTTP API con timeout configurable
  - Extracción de schema con APOC meta.schema (con fallback sin APOC)
  - Formateo de schema para consumo LLM
  - Transformación de resultados Neo4j a JSON plano
  - Validación de sintaxis Cypher básica
  - Detección de queries read vs write
  - Generación de resumen de operaciones write (counters)
- **Integraciones realizadas:**
  - Handlers MCP actualizados para usar cliente Neo4j
  - Manejo de caso sin conexión configurada
  - Contexto de handlers extendido (neo4jClient, timeout, tokenLimit)
- **Verificaciones realizadas:**
  - TypeScript compila sin errores
  - Servidor inicia correctamente
  - Herramientas retornan error apropiado sin conexión Neo4j
- **Próximos pasos:** ~~Iniciar Fase 4 (Sanitización y Tokens)~~ COMPLETADO

#### Sesión 2 - 2025-12-23
- **Actividad:** Implementación Fase 4 - Sanitización y Tokens
- **Archivos creados:**
  - `src/utils/sanitize.ts` - Sanitización de datos para LLM
  - `src/utils/tokens.ts` - Truncado por tokens (alternativa a tiktoken)
- **Funcionalidades implementadas:**
  - Filtrado de listas > 128 elementos
  - Detección y eliminación de embeddings (arrays numéricos largos)
  - Detección de propiedades con nombres de embedding
  - Procesamiento recursivo de estructuras anidadas
  - Eliminación de valores null/undefined
  - Estimación de tokens (~4 caracteres = 1 token)
  - Truncado inteligente de strings (busca puntos de corte en newlines/espacios)
  - Truncado de arrays con búsqueda binaria
  - Integración en handlers MCP (get_schema, read_cypher)
- **Verificaciones realizadas:**
  - TypeScript compila sin errores
- **Próximos pasos:** ~~Iniciar Fase 5 (Autenticación y Storage)~~ COMPLETADO

#### Sesión 2 (continuación) - 2025-12-23
- **Actividad:** Implementación Fase 5 - Autenticación y Storage
- **Archivos creados:**
  - `src/auth/crypto.ts` - Encriptación AES-GCM con Web Crypto API
  - `src/auth/session.ts` - Gestión de sesiones en KV
  - `src/auth/middleware.ts` - Middleware de autenticación
  - `src/storage/users.ts` - CRUD de usuarios en D1
  - `src/storage/connections.ts` - CRUD de conexiones con credenciales encriptadas
  - `src/storage/cache.ts` - Caché de schema en KV
- **Funcionalidades implementadas:**
  - Encriptación AES-GCM (256 bits) con IVs únicos
  - Formato combinado iv:ciphertext para almacenamiento
  - Tokens de sesión URL-safe (32 bytes)
  - Sesiones en KV con TTL configurable (24h default)
  - Doble verificación de expiración (KV + timestamp)
  - Extracción de tokens de múltiples fuentes (Authorization, X-Session-Token, query param)
  - CRUD completo de usuarios y conexiones
  - Encriptación/desencriptación automática de credenciales Neo4j
  - Soporte para múltiples conexiones por usuario
  - Caché de schema con TTL (5 min default)
  - Funciones genéricas de caché reutilizables
- **Verificaciones realizadas:**
  - TypeScript compila sin errores
- **Próximos pasos:** ~~Iniciar Fase 6 (Integración Completa)~~ COMPLETADO

#### Sesión 2 (continuación) - 2025-12-23
- **Actividad:** Implementación Fase 6 - Integración Completa
- **Archivos modificados:**
  - `src/index.ts` - Integración de autenticación en flujo MCP
  - `src/mcp/handlers.ts` - Caché de schema, contexto completo
  - `src/storage/cache.ts` - Tipo ProcessedSchema para caché
- **Funcionalidades implementadas:**
  - Autenticación opcional para métodos MCP (initialize/tools/list públicos, tools/call requiere auth)
  - Creación dinámica de Neo4jClient desde conexión autenticada
  - Caché de schema integrado en handler get_neo4j_schema
  - Contexto completo con userId, connectionId, neo4jClient
  - Paso de configuración (timeout, tokenLimit, schemaSampleSize) desde env
- **Pruebas realizadas:**
  - `/health` - OK
  - `initialize` - OK
  - `tools/list` - OK (devuelve 3 herramientas)
  - `tools/call` sin auth - Error apropiado solicitando configuración
- **Próximos pasos:** ~~Iniciar Fase 7 (UI de Configuración)~~ COMPLETADO

#### Sesión 2 (continuación) - 2025-12-23
- **Actividad:** Implementación Fase 7 - UI de Configuración
- **Archivos creados:**
  - `src/config/ui.ts` - Página HTML/CSS/JS completa para setup
  - `src/api/setup.ts` - Handlers para POST /setup y GET /api/setup
- **Archivos modificados:**
  - `src/index.ts` - Router actualizado con nuevas rutas
- **Funcionalidades implementadas:**
  - Página de setup responsive con formulario Neo4j
  - Validación client-side de inputs
  - Feedback visual de errores y éxito
  - POST /setup y POST /api/setup - Crear conexión
  - GET /api/setup - Verificar estado de conexión
  - Validación de credenciales Neo4j antes de guardar
  - Generación de token de sesión
  - Instrucciones para uso con Claude
  - Función copyToken para copiar al clipboard
  - Función startOver para configurar otra conexión
- **Pruebas realizadas:**
  - GET /setup - Muestra página HTML correctamente
  - POST /api/setup con URI inválida - Error apropiado
  - POST /api/setup con credenciales inválidas - Error apropiado
  - POST /setup funciona igual que POST /api/setup
  - GET /api/setup sin token - Indica no autenticado
- **Próximos pasos:** ~~Iniciar Fase 8 (Testing)~~ COMPLETADO

#### Sesión 2 (continuación) - 2025-12-23
- **Actividad:** Implementación Fase 8 - Testing
- **Archivos creados:**
  - `vitest.config.ts` - Configuración de Vitest
  - `test/setup.ts` - Mocks para Cloudflare bindings (KV, D1)
  - `test/unit/sanitize.test.ts` - 20 tests de sanitización
  - `test/unit/tokens.test.ts` - 14 tests de tokens
  - `test/unit/crypto.test.ts` - 21 tests de crypto
  - `test/unit/protocol.test.ts` - 25 tests de protocolo MCP
  - `test/unit/neo4j-client.test.ts` - 11 tests de cliente Neo4j
  - `test/integration/mcp.test.ts` - 13 tests de integración MCP
- **Funcionalidades testeadas:**
  - Sanitización de datos (embeddings, listas largas, nulls)
  - Estimación y truncado de tokens
  - Encriptación/desencriptación AES-GCM
  - Generación de tokens URL-safe
  - Hashing SHA-256
  - Parser JSON-RPC 2.0
  - Validación de requests MCP
  - Cliente Neo4j HTTP (mocked)
  - Flujo completo MCP (initialize, tools/list, tools/call)
- **Total:** 106 tests pasando
- **Próximos pasos:** ~~Iniciar Fase 9 (Seguridad y Hardening)~~ COMPLETADO

#### Sesión 3 - 2025-12-23
- **Actividad:** Implementación Fase 9 - Seguridad y Hardening
- **Archivos creados:**
  - `src/security/ratelimit.ts` - Rate limiting con KV storage
  - `src/security/query-validator.ts` - Validación de queries peligrosas
  - `src/security/audit.ts` - Logging de seguridad
  - `src/security/index.ts` - Re-exports del módulo
  - `test/unit/security.test.ts` - 38 tests de seguridad
- **Archivos modificados:**
  - `src/index.ts` - Integración de rate limiting y audit logging
  - `src/mcp/handlers.ts` - Integración de validación de queries
  - `test/setup.ts` - Fix para mock de KV con type 'json'
- **Funcionalidades implementadas:**
  - **Rate Limiting:**
    - Fixed window algorithm con contador en KV
    - Límite configurable (default: 100 req/60s)
    - Identificación por userId, CF-Connecting-IP, X-Forwarded-For
    - Headers estándar (X-RateLimit-Limit, Remaining, Reset)
    - Respuesta 429 con Retry-After
  - **Query Validation:**
    - Bloqueo de operaciones administrativas (DROP DATABASE, CREATE USER, etc.)
    - Bloqueo de GRANT/REVOKE
    - Bloqueo de DBMS procedures del sistema
    - Bloqueo de LOAD CSV desde URLs remotas
    - Validación de longitud de query (max 100KB)
    - Detección de queries sin LIMIT (warning)
    - Sanitización de parámetros de query
  - **Audit Logging:**
    - Eventos: auth_success, auth_failure, rate_limit_exceeded
    - Eventos: query_executed, query_blocked
    - Eventos: setup_attempt, setup_success, setup_failure
    - Eventos: suspicious_activity
    - Máscara de datos sensibles
    - Extracción de client IP y user agent
- **Verificaciones realizadas:**
  - TypeScript compila sin errores
  - 144 tests pasando (38 nuevos de seguridad)
- **Próximos pasos:** ~~Iniciar Fase 10 (Documentación y Deploy)~~ COMPLETADO

#### Sesión 3 (continuación) - 2025-12-23
- **Actividad:** Implementación Fase 10 - Documentación
- **Archivos creados:**
  - `README.md` - Reescrito con quick start, arquitectura, configuración
  - `docs/DEPLOYMENT.md` - Guía completa de deploy a Cloudflare
  - `docs/SECURITY.md` - Documentación de medidas de seguridad
  - `docs/API.md` - Referencia de API (endpoints HTTP, herramientas MCP)
- **Contenido documentado:**
  - **README.md:**
    - Features del proyecto
    - Quick start (3 pasos)
    - Tabla de herramientas MCP
    - Diagrama de arquitectura
    - Variables de configuración
  - **DEPLOYMENT.md:**
    - Prerrequisitos
    - Creación de recursos Cloudflare (D1, KV)
    - Configuración de wrangler.toml
    - Gestión de secrets
    - Verificación post-deploy
    - Troubleshooting
    - Backup y recovery
  - **SECURITY.md:**
    - Encriptación AES-256-GCM
    - Autenticación con tokens
    - Rate limiting (configuración, headers, respuestas)
    - Validación de queries (operaciones bloqueadas)
    - Audit logging (eventos, formato)
    - CORS
    - Best practices
  - **API.md:**
    - Endpoints HTTP (/health, /setup, /api/setup, /mcp)
    - Protocolo MCP (initialize, tools/list, tools/call)
    - Herramientas MCP con ejemplos detallados
    - Códigos de error
    - Ejemplos de queries Cypher
- **Estado del proyecto:**
  - Fases 1-10.3 (incluyendo Deploy Producción): Completadas
  - Pendiente: CI/CD (GitHub Actions)

#### Sesión 4 - 2025-12-23
- **Actividad:** Deploy Producción a Cloudflare Workers
- **Recursos creados:**
  - D1 Database: `mcp-neo4j-users-prod` (ID: `40e22b7e-96ca-453d-9263-8fcfa61df034`)
  - KV Namespace: `SESSIONS` (ID: `dfd68ab532eb4ccb82289c310eb089af`)
- **Configuración:**
  - Actualizado `wrangler.toml` con IDs de recursos producción
  - Configurado `ENCRYPTION_KEY` como secret
  - Aplicado schema D1 a base de datos producción
- **Deploy realizado:** 2025-12-23T22:31:00.000Z
- **Smoke tests:** 37/37 pasados
- **Worker:** `mcp-neo4j-cypher`
- **URL Producción:** `https://mcp-neo4j-cypher.eduardodominguezotero.workers.dev`
- **Estado:** Producción completamente funcional

#### Sesión 3 (continuación) - 2025-12-23
- **Actividad:** Deploy Staging a Cloudflare Workers
- **Recursos creados:**
  - D1 Database: `mcp-neo4j-users-staging` (ID: `b0afd894-f058-4b38-9593-021dc5e1f79e`)
  - KV Namespace: `SESSIONS` (ID: `6273d16c007743598a144f6443872e7a`)
- **Configuración:**
  - Actualizado `wrangler.toml` con IDs de recursos staging
  - Configurado `ENCRYPTION_KEY` como secret
- **Deploys realizados:**
  - Deploy inicial: 2025-12-23T19:00:15.180Z
  - Deploy con secrets: 2025-12-23T19:03:38.603Z
- **Worker:** `mcp-neo4j-cypher-staging`
- **Estado:** Staging completamente funcional
- **Próximos pasos:** Deploy producción, CI/CD

---

## 9. Referencias Técnicas

### 9.1 Neo4j HTTP API

**Documentación:** https://neo4j.com/docs/http-api/current/

**Endpoint Query:**
```
POST https://{instance}.databases.neo4j.io/db/{database}/query/v2
Authorization: Basic {base64(username:password)}
Content-Type: application/json

{
  "statement": "MATCH (n) RETURN n LIMIT 10",
  "parameters": {}
}
```

### 9.2 MCP Protocol Spec

**Versión:** 2024-11-05
**Documentación:** https://modelcontextprotocol.io/docs/specification

**Métodos requeridos:**
- `initialize` / `initialized`
- `tools/list`
- `tools/call`

### 9.3 Cloudflare Workers

**Documentación:** https://developers.cloudflare.com/workers/
**D1:** https://developers.cloudflare.com/d1/
**KV:** https://developers.cloudflare.com/kv/

---

## 10. Glosario

| Término | Definición |
|---------|------------|
| **MCP** | Model Context Protocol - Protocolo para conectar LLMs con herramientas |
| **JSON-RPC 2.0** | Protocolo de comunicación usado por MCP |
| **D1** | Base de datos SQLite serverless de Cloudflare |
| **KV** | Key-Value store de Cloudflare |
| **APOC** | Awesome Procedures on Cypher - Librería de procedimientos Neo4j |
| **Cypher** | Lenguaje de consultas de Neo4j |
| **AES-GCM** | Algoritmo de encriptación simétrica |

---

**Fin del documento Roadmap.md**
