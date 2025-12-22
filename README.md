# MCP Neo4j Cypher Server

Servidor MCP (Model Context Protocol) que permite a usuarios de Claude.ai conectar sus propias instancias de Neo4j Aura y ejecutar consultas Cypher mediante lenguaje natural.

## Requisitos

- Node.js >= 18.0.0
- Cuenta de Cloudflare
- Instancia de Neo4j Aura (o Neo4j compatible con HTTP API)

## Instalacion

```bash
# Clonar repositorio
git clone <repository-url>
cd mcp-neo4j-cypher-cf

# Instalar dependencias
npm install

# Configurar Wrangler
wrangler login
```

## Configuracion

### 1. Crear recursos en Cloudflare

```bash
# Crear base de datos D1
wrangler d1 create mcp-neo4j-users

# Crear namespace KV
wrangler kv:namespace create "NEO4J_SESSIONS"

# Aplicar schema
npm run db:migrate:remote

# Configurar encryption key
openssl rand -base64 32 | wrangler secret put ENCRYPTION_KEY
```

### 2. Variables de entorno

Copia `.env.example` a `.env.local` y configura los valores necesarios.

## Desarrollo

```bash
# Iniciar servidor de desarrollo
npm run dev

# Ejecutar tests
npm test

# Linting
npm run lint

# Type checking
npm run typecheck

# Formatear codigo
npm run format
```

## Deploy

```bash
# Deploy a staging
npm run deploy:staging

# Deploy a produccion
npm run deploy:production
```

## Herramientas MCP

El servidor expone las siguientes herramientas:

| Herramienta | Descripcion |
|-------------|-------------|
| `get_neo4j_schema` | Extrae el esquema de la base de datos Neo4j |
| `read_neo4j_cypher` | Ejecuta queries Cypher de solo lectura |
| `write_neo4j_cypher` | Ejecuta queries Cypher de escritura |

## Arquitectura

```
Claude.ai --> Cloudflare Worker --> Neo4j Aura
                    |
                    +--> D1 (usuarios/conexiones)
                    +--> KV (sesiones/cache)
```

## Documentacion

Para documentacion detallada del proyecto, ver [Claude.md](./Claude.md).

## Licencia

MIT
