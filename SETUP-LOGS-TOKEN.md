# Configurar Token para Descarga de Logs

## Paso 1: Crear el Token en Cloudflare

Se acaba de abrir la página: https://dash.cloudflare.com/profile/api-tokens

### Opción A: Usar Plantilla (Recomendado)

1. Click en **"Create Token"**
2. Busca la plantilla **"Read Worker Logs"** o **"Edit Cloudflare Workers"**
3. Click en **"Use template"**
4. Configuración:
   - **Token name**: `worker-logs-download` (o el nombre que prefieras)
   - **Account Resources**: Selecciona tu cuenta
   - **Zone Resources**: Puede dejarse en "All zones" o "None"
5. Click en **"Continue to summary"**
6. Revisa los permisos (debe incluir `Workers Scripts - Read`)
7. Click en **"Create Token"**
8. **IMPORTANTE**: Copia el token que se muestra (solo se muestra una vez)

### Opción B: Token Custom (Permisos Específicos)

Si prefieres permisos más específicos:

1. Click en **"Create Custom Token"**
2. **Token name**: `worker-logs-download`
3. **Permissions**:
   - Account > Workers Scripts > Read
   - Account > Workers Tail > Read (opcional, para logs en tiempo real)
4. **Account Resources**:
   - Include > Specific account > [Tu cuenta]
5. **TTL**: Puedes dejarlo indefinido o configurar expiración
6. Click en **"Continue to summary"** → **"Create Token"**
7. **Copia el token generado**

## Paso 2: Configurar el Token

Después de copiar el token, ejecuta UNO de estos comandos según tu terminal:

### Windows PowerShell
```powershell
$env:CLOUDFLARE_API_TOKEN="tu-token-aqui"
```

### Windows CMD
```cmd
set CLOUDFLARE_API_TOKEN=tu-token-aqui
```

### Linux/macOS/Git Bash
```bash
export CLOUDFLARE_API_TOKEN="tu-token-aqui"
```

## Paso 3: Verificar la Configuración

```bash
# PowerShell
echo $env:CLOUDFLARE_API_TOKEN

# CMD
echo %CLOUDFLARE_API_TOKEN%

# Linux/macOS/Git Bash
echo $CLOUDFLARE_API_TOKEN
```

Deberías ver tu token impreso en la terminal.

## Paso 4: Descargar los Logs

```bash
# Descargar logs de los últimos 5 días
npm run logs:download

# O personalizar
node scripts/download-logs.js 3 logs-3-days.json
```

## Ejemplo Completo

```powershell
# 1. Configurar token (PowerShell)
$env:CLOUDFLARE_API_TOKEN="abc123xyz789..."

# 2. Verificar
echo $env:CLOUDFLARE_API_TOKEN

# 3. Descargar
npm run logs:download
```

---

## Permisos Mínimos Necesarios

Para que el script funcione, el token DEBE tener:

✅ **Account > Workers Scripts > Read**

Permisos opcionales pero útiles:
- Account > Workers Tail > Read (para `wrangler tail`)
- Account > Workers KV Storage > Read (si quieres leer KV)
- Account > D1 > Read (si quieres leer D1)

---

## Seguridad

- ⚠️ **NUNCA** commitees el token a git
- ⚠️ **NUNCA** compartas el token públicamente
- 💡 Configúralo solo como variable de entorno
- 💡 Considera usar tokens con TTL limitado para tareas puntuales
- 💡 Revoca tokens que ya no necesites

---

## Troubleshooting

### Error: "Invalid authentication credentials"
- Verifica que el token esté configurado correctamente
- Asegúrate de no tener espacios extra al copiar
- Revisa que el token tenga los permisos necesarios

### Error: "This Worker does not exist on your account"
- Verifica el `account_id` en `wrangler.toml`
- Asegúrate de que el token sea de la cuenta correcta

### Error: "Token expired"
- El token ha expirado, crea uno nuevo

---

**¿Listo?** Una vez configurado el token, vuelve a Claude Code y ejecutaremos la descarga.
