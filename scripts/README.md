# Scripts

## download-logs.js

Script para descargar logs históricos de Cloudflare Workers (últimos 7 días disponibles).

### Requisitos

1. **Cloudflare API Token** con permisos de lectura para Workers
   - Crear en: https://dash.cloudflare.com/profile/api-tokens
   - Permisos necesarios: `Account > Workers Scripts > Read`

2. Configurar el token como variable de entorno:

**Linux/macOS:**
```bash
export CLOUDFLARE_API_TOKEN="tu-token-aqui"
```

**Windows (PowerShell):**
```powershell
$env:CLOUDFLARE_API_TOKEN="tu-token-aqui"
```

### Uso

```bash
# Descargar logs de los últimos 5 días (default)
npm run logs:download

# O directamente con node
node scripts/download-logs.js

# Personalizar días y archivo de salida
node scripts/download-logs.js 3 logs-3-days.json
node scripts/download-logs.js 7 logs-week.json
```

### Parámetros

- **Parámetro 1**: Número de días hacia atrás (default: 5, máximo: 7)
- **Parámetro 2**: Nombre del archivo de salida (default: `logs-last-N-days.json`)

### Salida

El script genera un archivo JSON con estructura:

```json
{
  "data": [
    {
      "timestamp": "2026-01-08T08:28:11.013Z",
      "outcome": "ok",
      "scriptName": "mcp-neo4j-cypher",
      "cpuTime": 2,
      "wallTime": 1649,
      "logs": [...],
      "event": {...}
    }
  ],
  "meta": {
    "duration_ms": 1234,
    "rows": 850
  }
}
```

### Ejemplos

```bash
# Últimos 5 días
npm run logs:download

# Último día
node scripts/download-logs.js 1 logs-today.json

# Última semana completa
node scripts/download-logs.js 7 logs-week.json
```

Para más información, consulta [docs/LOGS.md](../docs/LOGS.md)
