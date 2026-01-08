# Configurar Workers Logpush para Logs Históricos

Cloudflare Workers **no ofrece API REST directo** para descargar logs históricos de los últimos 7 días.

## Soluciones Disponibles

### 1. Logs en Tiempo Real ✅ (Ya configurado)

```bash
npm run tail:production
```

### 2. Dashboard Manual 📊

Acceder a: https://dash.cloudflare.com
- Workers & Pages → mcp-neo4j-cypher → Logs

### 3. Workers Logpush 🚀 (Recomendado para retención > 7 días)

Configurar envío automático de logs a R2 (Object Storage de Cloudflare):

#### Paso 1: Crear Bucket R2

```bash
# Crear bucket para logs
wrangler r2 bucket create mcp-neo4j-logs

# Verificar
wrangler r2 bucket list
```

#### Paso 2: Crear Job de Logpush

```bash
# Usando wrangler
wrangler logpush create \
  --name="mcp-neo4j-logs-production" \
  --destination="r2://mcp-neo4j-logs/production-logs" \
  --dataset="workers_trace_events" \
  --filter='{"where":{"key":"ScriptName","operator":"eq","value":"mcp-neo4j-cypher"}}'
```

O vía API:

```bash
curl -X POST "https://api.cloudflare.com/client/v4/accounts/YOUR_ACCOUNT_ID/logpush/jobs" \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "name": "mcp-neo4j-logs-production",
    "destination_conf": "r2://mcp-neo4j-logs/production-logs/{DATE}",
    "dataset": "workers_trace_events",
    "filter": "{\"where\":{\"key\":\"ScriptName\",\"operator\":\"eq\",\"value\":\"mcp-neo4j-cypher\"}}",
    "enabled": true
  }'
```

#### Paso 3: Descargar Logs desde R2

Una vez configurado Logpush, los logs se almacenarán indefinidamente en R2:

```bash
# Listar archivos de logs
wrangler r2 object list mcp-neo4j-logs --prefix production-logs/

# Descargar logs de un día específico
wrangler r2 object get mcp-neo4j-logs/production-logs/2026-01-08/logs.json \
  --file logs-2026-01-08.json
```

#### Estructura de Logs en R2

```
mcp-neo4j-logs/
├── production-logs/
│   ├── 2026-01-08/
│   │   ├── 00_00.json.gz
│   │   ├── 01_00.json.gz
│   │   └── ...
│   ├── 2026-01-09/
│   └── ...
```

#### Consultar Logs con SQL

Puedes usar herramientas como DuckDB para consultar logs localmente:

```bash
# Instalar DuckDB
# Windows: winget install DuckDB.CLI

# Consultar logs
duckdb -c "
  SELECT
    timestamp,
    outcome,
    scriptName,
    logs
  FROM read_json_auto('logs-*.json.gz')
  WHERE outcome = 'error'
  ORDER BY timestamp DESC
  LIMIT 100
"
```

## Comparación de Opciones

| Método | Retención | Costo | Acceso | Filtros |
|--------|-----------|-------|--------|---------|
| `wrangler tail` | Real-time | Gratis | CLI | Sí |
| Dashboard | 7 días | Gratis | Web | Sí |
| Logpush → R2 | Indefinido | ~$0.015/GB/mes | CLI/API | SQL |

## Costos de Logpush

- **Logpush**: Incluido en Workers Paid ($5/mes)
- **R2 Storage**: $0.015/GB/mes
- **R2 Operations**:
  - Write: $4.50 por millón
  - Read: $0.36 por millón (primeros 10M gratis)

### Estimación para MCP Neo4j:

- ~1,000 requests/día
- ~10KB por request con logs
- ~10MB/día = ~300MB/mes
- **Costo mensual R2**: ~$0.005 (insignificante)

## Script de Descarga desde R2

Una vez configurado Logpush:

```javascript
// scripts/download-r2-logs.js
import { execSync } from 'child_process';
import fs from 'fs';

const days = process.argv[2] || 7;
const output = process.argv[3] || 'logs-r2.json';

const dates = [];
for (let i = 0; i < days; i++) {
  const date = new Date();
  date.setDate(date.getDate() - i);
  dates.push(date.toISOString().split('T')[0]);
}

const allLogs = [];

for (const date of dates) {
  console.log(`Downloading logs for ${date}...`);

  // Listar objetos del día
  const list = execSync(
    `wrangler r2 object list mcp-neo4j-logs --prefix production-logs/${date}/`
  ).toString();

  const files = list.split('\n').filter(l => l.includes('.json'));

  for (const file of files) {
    const tempFile = `temp-${date}.json.gz`;
    execSync(
      `wrangler r2 object get mcp-neo4j-logs/${file} --file ${tempFile}`
    );

    // Descomprimir y parsear
    const content = execSync(`gunzip -c ${tempFile}`).toString();
    const logs = content.split('\n').filter(l => l).map(l => JSON.parse(l));
    allLogs.push(...logs);

    fs.unlinkSync(tempFile);
  }
}

fs.writeFileSync(output, JSON.stringify(allLogs, null, 2));
console.log(`✅ Downloaded ${allLogs.length} logs to ${output}`);
```

## Recomendación

Para tu caso de uso (auditoría y análisis):

1. **Corto plazo**: Usar Dashboard manualmente cuando necesites revisar algo
2. **Largo plazo**: Configurar Logpush a R2 (prácticamente gratis y logs indefinidos)

¿Quieres que configure Logpush ahora?
