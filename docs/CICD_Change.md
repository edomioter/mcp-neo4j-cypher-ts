# Cambio de Entorno Cloudflare - Guía de Migración CI/CD

**Fecha de creación:** 2026-01-10
**Estado:** Pendiente
**Propósito:** Documentar los pasos necesarios para migrar los pipelines CI/CD a un nuevo entorno de Cloudflare

---

## 1. Información Necesaria del Nuevo Entorno Cloudflare

### A. Credenciales de Cuenta

| Item | Dónde Obtenerlo | Uso |
|------|-----------------|-----|
| **Account ID** | Cloudflare Dashboard → Workers → Overview (sidebar derecho) | `wrangler.toml` línea 6 |
| **API Token** | Cloudflare Dashboard → My Profile → API Tokens → Create Token | GitHub Secret |

**Para crear el API Token:**
- Template recomendado: "Edit Cloudflare Workers"
- Permisos mínimos requeridos:
  - `Workers Scripts:Edit`
  - `Workers KV Storage:Edit`
  - `D1:Edit`
  - `Account Settings:Read` (opcional, para verificación)

---

### B. Recursos a Crear en el Nuevo Cloudflare

| Recurso | Entorno | Nombre Sugerido | Campo en wrangler.toml |
|---------|---------|-----------------|------------------------|
| **D1 Database** | Staging | `mcp-neo4j-users-staging` | `env.staging.d1_databases.database_id` |
| **D1 Database** | Production | `mcp-neo4j-users-prod` | `env.production.d1_databases.database_id` |
| **KV Namespace** | Staging | `mcp-sessions-staging` | `env.staging.kv_namespaces.id` |
| **KV Namespace** | Production | `mcp-sessions-prod` | `env.production.kv_namespaces.id` |

**Comandos para crear recursos:**

```bash
# Configurar cuenta (si es necesario)
wrangler login

# D1 Databases
wrangler d1 create mcp-neo4j-users-staging
wrangler d1 create mcp-neo4j-users-prod

# KV Namespaces
wrangler kv:namespace create SESSIONS --env staging
wrangler kv:namespace create SESSIONS --env production
```

**Nota:** Los comandos anteriores devolverán los IDs necesarios para configurar `wrangler.toml`.

---

### C. Secrets a Configurar

| Secret | Comando | Descripción |
|--------|---------|-------------|
| `ENCRYPTION_KEY` | Ver abajo | Clave AES-256 para encriptar credenciales Neo4j |

```bash
# Generar y configurar ENCRYPTION_KEY para staging
openssl rand -base64 32 | wrangler secret put ENCRYPTION_KEY --env staging

# Generar y configurar ENCRYPTION_KEY para production
openssl rand -base64 32 | wrangler secret put ENCRYPTION_KEY --env production
```

**Importante:** Usar la misma clave en ambos entornos si se migran datos, o claves diferentes si se empieza limpio.

---

## 2. Archivos a Modificar

### A. `wrangler.toml` - Configuración de Cloudflare

**Ubicación:** `/wrangler.toml`

```toml
# Línea 6 - Account ID
account_id = "NUEVO_ACCOUNT_ID"

# ============================================
# Staging Environment (líneas 45-52)
# ============================================
[env.staging]
name = "NUEVO_NOMBRE_WORKER-staging"

[[env.staging.d1_databases]]
binding = "DB"
database_name = "mcp-neo4j-users-staging"
database_id = "NUEVO_D1_STAGING_ID"

[[env.staging.kv_namespaces]]
binding = "SESSIONS"
id = "NUEVO_KV_STAGING_ID"

# ============================================
# Production Environment (líneas 57-74)
# ============================================
[env.production]
name = "NUEVO_NOMBRE_WORKER"

[[env.production.d1_databases]]
binding = "DB"
database_name = "mcp-neo4j-users-prod"
database_id = "NUEVO_D1_PRODUCTION_ID"

[[env.production.kv_namespaces]]
binding = "SESSIONS"
id = "NUEVO_KV_PRODUCTION_ID"
```

---

### B. `.github/workflows/deploy-staging.yml`

**Cambios necesarios:**

| Línea | Campo | Valor Actual | Nuevo Valor |
|-------|-------|--------------|-------------|
| 41 | `url` | `https://mcp-neo4j-cypher-staging.eduardodominguezotero.workers.dev` | `https://NUEVO_WORKER-staging.NUEVO_SUBDOMINIO.workers.dev` |
| 66 | `STAGING_URL` | `https://mcp-neo4j-cypher-staging.eduardodominguezotero.workers.dev` | `https://NUEVO_WORKER-staging.NUEVO_SUBDOMINIO.workers.dev` |
| 79 | URL en logs | Igual | Actualizar |

---

### C. `.github/workflows/deploy-production.yml`

**Cambios necesarios:**

| Línea | Campo | Valor Actual | Nuevo Valor |
|-------|-------|--------------|-------------|
| 60 | `url` (staging) | `https://mcp-neo4j-cypher-staging.eduardodominguezotero.workers.dev` | `https://NUEVO_WORKER-staging.NUEVO_SUBDOMINIO.workers.dev` |
| 85 | `STAGING_URL` | Igual | Actualizar |
| 93 | `url` (production) | `https://mcp-neo4j-cypher.eduardodominguezotero.workers.dev` | `https://NUEVO_WORKER.NUEVO_SUBDOMINIO.workers.dev` |
| 118 | `STAGING_URL` | Igual | Actualizar |
| 124 | URL en summary | Igual | Actualizar |
| 140 | URL en logs | Igual | Actualizar |

---

### D. GitHub Secrets

**Ubicación:** Repository Settings → Secrets and variables → Actions

| Secret | Descripción | Acción |
|--------|-------------|--------|
| `CLOUDFLARE_API_TOKEN` | Token de API del nuevo Cloudflare | Actualizar valor |

---

## 3. Migraciones D1 (si aplica)

Si el proyecto tiene schema de base de datos, ejecutar migraciones:

```bash
# Ver migraciones disponibles
ls -la migrations/

# Aplicar migraciones a staging
wrangler d1 migrations apply mcp-neo4j-users-staging --env staging

# Aplicar migraciones a production
wrangler d1 migrations apply mcp-neo4j-users-prod --env production
```

---

## 4. Checklist de Migración

### Fase 1: Preparación del Nuevo Entorno

- [ ] Obtener Account ID del nuevo Cloudflare
- [ ] Crear API Token con permisos correctos
- [ ] Crear D1 Database para staging
- [ ] Crear D1 Database para production
- [ ] Crear KV Namespace para staging
- [ ] Crear KV Namespace para production
- [ ] Anotar todos los IDs generados

### Fase 2: Configuración de Secrets

- [ ] Configurar ENCRYPTION_KEY en staging
- [ ] Configurar ENCRYPTION_KEY en production
- [ ] Actualizar CLOUDFLARE_API_TOKEN en GitHub Secrets

### Fase 3: Actualización de Código

- [ ] Actualizar `wrangler.toml` con nuevos IDs
- [ ] Actualizar `deploy-staging.yml` con nuevas URLs
- [ ] Actualizar `deploy-production.yml` con nuevas URLs
- [ ] Commit y push de cambios

### Fase 4: Migraciones y Datos

- [ ] Ejecutar migraciones D1 en staging
- [ ] Ejecutar migraciones D1 en production
- [ ] Migrar datos de KV (si necesario)
- [ ] Migrar datos de D1 (si necesario)

### Fase 5: Verificación

- [ ] Probar deploy a staging (push a main o workflow_dispatch)
- [ ] Verificar smoke tests pasan en staging
- [ ] Probar deploy a producción (workflow_dispatch con "deploy")
- [ ] Verificar smoke tests pasan en producción
- [ ] Probar funcionalidad completa con MCP

---

## 5. Configuración Actual (Referencia)

### Valores Actuales en wrangler.toml

```toml
account_id = "fbe074a4d149441eb68832d5b116cbf6"

# Staging
env.staging.d1_databases.database_id = "b0afd894-f058-4b38-9593-021dc5e1f79e"
env.staging.kv_namespaces.id = "6273d16c007743598a144f6443872e7a"

# Production
env.production.d1_databases.database_id = "40e22b7e-96ca-453d-9263-8fcfa61df034"
env.production.kv_namespaces.id = "dfd68ab532eb4ccb82289c310eb089af"
```

### URLs Actuales

| Entorno | URL |
|---------|-----|
| Staging | `https://mcp-neo4j-cypher-staging.eduardodominguezotero.workers.dev` |
| Production | `https://mcp-neo4j-cypher.eduardodominguezotero.workers.dev` |

---

## 6. Rollback

Si algo falla, revertir los cambios:

1. Restaurar `wrangler.toml` con valores anteriores
2. Restaurar workflows con URLs anteriores
3. Restaurar `CLOUDFLARE_API_TOKEN` en GitHub Secrets
4. Push de los cambios revertidos

---

## 7. Notas Adicionales

- Los workers de Cloudflare se despliegan globalmente, puede tomar 1-2 minutos para propagación completa
- Los KV namespaces son eventualmente consistentes (puede haber delay de segundos)
- D1 tiene límites en el plan gratuito: 5GB storage, 5M rows read/day
- Mantener backup de los IDs antiguos por si se necesita rollback

---

**Documento creado por:** Claude Code
**Última actualización:** 2026-01-10
