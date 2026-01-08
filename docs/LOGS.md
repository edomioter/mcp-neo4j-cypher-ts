# Logs Documentation

## Cloudflare Workers Logs Management

Este documento describe cómo acceder y descargar logs del servidor MCP Neo4j Cypher desplegado en Cloudflare Workers.

---

## 📊 Tipos de Logs Disponibles

### 1. Logs en Tiempo Real (Streaming)

Usando `wrangler tail` puedes ver logs en tiempo real mientras el worker está siendo usado.

### 2. Logs Históricos (Últimos 7 días)

Cloudflare almacena automáticamente todos los logs de Workers por hasta **7 días**. Puedes consultarlos y descargarlos usando la API de Observability.

---

## 🔴 Logs en Tiempo Real

### Ver logs en formato pretty (legible)

```bash
# Producción
npm run tail:production

# Staging
npm run tail:staging

# O directamente con wrangler
wrangler tail --env production --format pretty
```

### Ver logs en formato JSON

```bash
wrangler tail --env production --format json
```

### Filtrar logs

```bash
# Solo errores
wrangler tail --env production --status error

# Buscar por texto
wrangler tail --env production --search "AUDIT"

# Filtrar por método HTTP
wrangler tail --env production --method POST

# Filtrar por IP
wrangler tail --env production --ip 34.162.136.91

# Combinar múltiples filtros
wrangler tail --env production --format pretty --status error --search "Neo4j"
```

### Opciones disponibles

| Opción | Descripción | Valores |
|--------|-------------|---------|
| `--format` | Formato de salida | `json`, `pretty` |
| `--status` | Filtrar por estado | `ok`, `error`, `canceled` |
| `--method` | Filtrar por método HTTP | `GET`, `POST`, etc. |
| `--search` | Buscar en console.log | Texto a buscar |
| `--ip` | Filtrar por IP de origen | IP address o `self` |
| `--sampling-rate` | Porcentaje de logs a mostrar | 0-100 |

---

## 💾 Descargar Logs Históricos

### Requisitos Previos

Necesitas un **Cloudflare API Token** con permisos de lectura para Workers.

#### Crear API Token

1. Ve a https://dash.cloudflare.com/profile/api-tokens
2. Click en "Create Token"
3. Usa la plantilla "Edit Cloudflare Workers"
4. O crea uno custom con permisos:
   - **Account** > **Workers Scripts** > **Read**
   - **Account** > **Workers Tail** > **Read**
5. Copia el token generado

#### Configurar el Token

**Linux/macOS:**
```bash
export CLOUDFLARE_API_TOKEN="tu-token-aqui"
```

**Windows (PowerShell):**
```powershell
$env:CLOUDFLARE_API_TOKEN="tu-token-aqui"
```

**Windows (CMD):**
```cmd
set CLOUDFLARE_API_TOKEN=tu-token-aqui
```

### Descargar Logs

#### Opción 1: Usando npm script (Últimos 5 días)

```bash
npm run logs:download
```

Esto descargará los logs de los últimos **5 días** en un archivo `logs-last-5-days.json`.

#### Opción 2: Script personalizado

```bash
# Últimos 3 días
node scripts/download-logs.js 3 logs-3-days.json

# Última semana (7 días - máximo disponible)
node scripts/download-logs.js 7 logs-week.json

# Último día
node scripts/download-logs.js 1 logs-today.json
```

### Formato del archivo JSON descargado

```json
{
  "data": [
    {
      "timestamp": "2026-01-08T08:28:11.013Z",
      "outcome": "ok",
      "scriptName": "mcp-neo4j-cypher",
      "scriptVersion": {
        "id": "1f2540c4-a7cb-4a20-8121-6e5b56d976e4"
      },
      "cpuTime": 2,
      "wallTime": 1649,
      "logs": [
        {
          "message": ["{\"timestamp\":\"2026-01-08T08:28:11.013Z\",\"level\":\"info\",\"message\":\"AUDIT: Authentication successful\",\"context\":{\"userId\":\"usr_xxx\",\"clientIp\":\"34.162.136.91\"}}"],
          "level": "log",
          "timestamp": 1767860891013
        }
      ],
      "exceptions": [],
      "event": {
        "request": {
          "url": "https://mcp-neo4j-cypher.eduardodominguezotero.workers.dev/mcp",
          "method": "POST",
          "headers": { ... },
          "cf": { ... }
        }
      }
    }
  ],
  "meta": {
    "duration_ms": 1234,
    "rows": 850
  }
}
```

---

## 📈 Análisis de Logs

### Estructura de Logs del Servidor

Nuestro servidor emite logs en formato JSON estructurado:

```json
{
  "timestamp": "2026-01-08T08:28:11.013Z",
  "level": "info",
  "message": "HTTP Request",
  "context": {
    "httpMethod": "POST",
    "url": "https://...",
    "userAgent": "Claude-User"
  }
}
```

### Tipos de Eventos Registrados

#### 1. HTTP Requests
```json
{
  "level": "info",
  "message": "HTTP Request",
  "context": {
    "httpMethod": "POST",
    "url": "...",
    "userAgent": "..."
  }
}
```

#### 2. MCP Protocol
```json
{
  "level": "info",
  "message": "MCP request received",
  "context": {
    "requestId": "...",
    "method": "tools/call",
    "id": 1
  }
}
```

#### 3. Audit Events (Seguridad)

**Autenticación exitosa:**
```json
{
  "level": "info",
  "message": "AUDIT: Authentication successful",
  "context": {
    "event": "auth_success",
    "userId": "usr_xxx",
    "clientIp": "34.162.136.91"
  }
}
```

**Autenticación fallida:**
```json
{
  "level": "warn",
  "message": "AUDIT: Authentication failed",
  "context": {
    "event": "auth_failure",
    "reason": "Invalid token"
  }
}
```

**Rate limit excedido:**
```json
{
  "level": "warn",
  "message": "AUDIT: Rate limit exceeded",
  "context": {
    "event": "rate_limit_exceeded",
    "identifier": "user:usr_xxx"
  }
}
```

**Query ejecutada:**
```json
{
  "level": "info",
  "message": "AUDIT: Neo4j query executed",
  "context": {
    "event": "query_executed",
    "userId": "usr_xxx",
    "queryType": "read",
    "queryPreview": "MATCH (n) RETURN..."
  }
}
```

**Query bloqueada:**
```json
{
  "level": "warn",
  "message": "AUDIT: Query blocked",
  "context": {
    "event": "query_blocked",
    "reason": "Contains write operation",
    "queryPreview": "CREATE..."
  }
}
```

#### 4. Neo4j Operations
```json
{
  "level": "info",
  "message": "Neo4j query executed",
  "context": {
    "duration": 245,
    "resultCount": 10
  }
}
```

#### 5. Errors
```json
{
  "level": "error",
  "message": "Neo4j connection failed",
  "context": {
    "error": "Connection timeout",
    "uri": "neo4j+s://xxx.databases.neo4j.io"
  }
}
```

---

## 🔍 Consultas Avanzadas

### Usando jq para analizar logs

Instalar jq: https://jqlang.github.io/jq/download/

```bash
# Contar requests por outcome
cat logs-last-5-days.json | jq '.data | group_by(.outcome) | map({outcome: .[0].outcome, count: length})'

# Extraer solo mensajes de error
cat logs-last-5-days.json | jq '.data[] | select(.outcome == "error")'

# Contar requests por día
cat logs-last-5-days.json | jq '.data | group_by(.timestamp[:10]) | map({date: .[0].timestamp[:10], count: length})'

# Extraer todos los logs de audit
cat logs-last-5-days.json | jq '.data[].logs[] | select(.message[0] | contains("AUDIT"))'

# Estadísticas de CPU time
cat logs-last-5-days.json | jq '{
  avg_cpu: (.data | map(.cpuTime) | add / length),
  max_cpu: (.data | map(.cpuTime) | max),
  min_cpu: (.data | map(.cpuTime) | min)
}'

# Extraer IPs únicas
cat logs-last-5-days.json | jq '.data[].event.request.headers["cf-connecting-ip"]' | sort -u

# Contar requests por user-agent
cat logs-last-5-days.json | jq '.data | group_by(.event.request.headers["user-agent"]) | map({agent: .[0].event.request.headers["user-agent"], count: length})'
```

### Script de análisis personalizado

```javascript
// analyze-logs.js
const fs = require('fs');

const logs = JSON.parse(fs.readFileSync('logs-last-5-days.json', 'utf-8'));

// Análisis básico
const stats = {
  total: logs.data.length,
  byOutcome: {},
  byDay: {},
  avgCpuTime: 0,
  avgWallTime: 0,
  errors: []
};

logs.data.forEach(log => {
  // Por outcome
  stats.byOutcome[log.outcome] = (stats.byOutcome[log.outcome] || 0) + 1;

  // Por día
  const day = log.timestamp.split('T')[0];
  stats.byDay[day] = (stats.byDay[day] || 0) + 1;

  // CPU/Wall time
  stats.avgCpuTime += log.cpuTime;
  stats.avgWallTime += log.wallTime;

  // Errores
  if (log.outcome === 'error') {
    stats.errors.push({
      timestamp: log.timestamp,
      exceptions: log.exceptions,
      logs: log.logs
    });
  }
});

stats.avgCpuTime /= stats.total;
stats.avgWallTime /= stats.total;

console.log(JSON.stringify(stats, null, 2));
```

---

## 📋 Dashboard de Cloudflare

También puedes ver logs en el dashboard de Cloudflare:

1. Ve a https://dash.cloudflare.com
2. Selecciona tu cuenta
3. Ve a **Workers & Pages**
4. Click en tu worker `mcp-neo4j-cypher`
5. Tab **Logs**

El dashboard ofrece:
- Visualización gráfica de logs
- Filtros interactivos
- Query builder visual
- Métricas en tiempo real

---

## ⚠️ Limitaciones

### Retención de Logs

- **Logs en tiempo real**: Infinitos mientras está ejecutándose `wrangler tail`
- **Logs históricos**: **7 días máximo** (almacenados automáticamente por Cloudflare)
- **Después de 7 días**: Los logs se eliminan automáticamente

### Volumen de Datos

- **Query limit**: 10,000 registros por query
- Para más de 10,000 registros, usa paginación o reduce el rango de fechas

### Costos

- **Workers Logs**: Incluido en todos los planes (Free, Paid, Enterprise)
- **API Calls**: Sin cargo adicional para consultas de logs
- **Storage**: Solo si exportas a R2 u otro destino (Workers Logpush)

---

## 🚀 Workers Logpush (Retención > 7 días)

Si necesitas retener logs por más de 7 días, puedes configurar **Workers Logpush** para enviar logs a:

- **R2** (Object Storage de Cloudflare)
- **S3** (Amazon)
- **GCS** (Google Cloud Storage)
- **Azure Blob Storage**
- **Datadog**, **Splunk**, **New Relic**, etc.

### Configurar Logpush a R2

```bash
# 1. Crear bucket R2
wrangler r2 bucket create mcp-logs

# 2. Crear job de Logpush
wrangler logpush create \
  --name="mcp-neo4j-logs" \
  --destination="r2://mcp-logs/workers-logs" \
  --dataset="workers_trace_events" \
  --filter="ScriptName eq 'mcp-neo4j-cypher'"
```

Documentación: https://developers.cloudflare.com/workers/observability/logs/logpush/

---

## 📞 Soporte

Si tienes problemas con los logs:

1. Verifica que `CLOUDFLARE_API_TOKEN` esté configurado correctamente
2. Asegúrate de que el token tenga permisos de lectura
3. Revisa el account_id en `wrangler.toml`
4. Consulta los logs de error en `wrangler tail`

Para más información:
- [Cloudflare Workers Logs Docs](https://developers.cloudflare.com/workers/observability/logs/)
- [Workers Observability API](https://developers.cloudflare.com/api/resources/workers/subresources/observability/)

---

**Última actualización:** 2026-01-08
