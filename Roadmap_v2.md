# Roadmap v2 - Optimización de Operaciones KV

## Plan de Reducción de Operaciones en Cloudflare KV

**Fecha de creación:** 2025-01-09
**Versión:** 2.0
**Objetivo:** Reducir el número de operaciones KV por llamada MCP para optimizar costos y latencia

---

## 1. Resumen Ejecutivo

### 1.1 Problema Identificado

Cada llamada al servidor MCP realiza múltiples operaciones contra Cloudflare KV:

| Tipo de Llamada | Operaciones KV | Desglose |
|-----------------|----------------|----------|
| Métodos públicos (`initialize`, `tools/list`) | 2 ops | 1R rate + 1W rate |
| `read_neo4j_cypher` / `write_neo4j_cypher` | 3 ops | 1R sesión + 1R rate + 1W rate |
| `get_neo4j_schema` (cache hit) | 4 ops | 1R sesión + 1R rate + 1W rate + 1R cache |
| `get_neo4j_schema` (cache miss) | 5 ops | 1R sesión + 1R rate + 1W rate + 1R cache + 1W cache |

### 1.2 Impacto

- **Latencia:** Cada operación KV añade ~10-50ms de latencia
- **Costos:** Plan gratuito limitado a 100,000 lecturas/día y 1,000 escrituras/día
- **Escalabilidad:** Alto volumen de usuarios puede alcanzar límites rápidamente

### 1.3 Objetivo

Reducir las operaciones KV en un **50% promedio** manteniendo la funcionalidad y seguridad del sistema.

---

## 2. Estado Actual del Sistema

### 2.1 Flujo de una Request MCP Autenticada

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Request   │────▶│   Auth      │────▶│ Rate Limit  │────▶│   Handler   │
└─────────────┘     └─────────────┘     └─────────────┘     └─────────────┘
                          │                   │                   │
                          ▼                   ▼                   ▼
                    ┌─────────────┐     ┌─────────────┐     ┌─────────────┐
                    │  KV: GET    │     │  KV: GET    │     │  KV: GET    │
                    │  session    │     │  rate_limit │     │  cache      │
                    └─────────────┘     └─────────────┘     └─────────────┘
                                              │
                                              ▼
                                        ┌─────────────┐
                                        │  KV: PUT    │
                                        │  rate_limit │
                                        └─────────────┘
```

### 2.2 Archivos Involucrados

| Archivo | Operaciones KV | Función |
|---------|----------------|---------|
| `src/auth/session.ts` | GET, DELETE | Validación de sesiones |
| `src/security/ratelimit.ts` | GET, PUT | Control de rate limiting |
| `src/storage/cache.ts` | GET, PUT, DELETE | Caché de schema Neo4j |

### 2.3 Claves KV Utilizadas

```
session:{token}        → SessionData (userId, connectionId, expiresAt)
rate:{identifier}      → RateLimitEntry (count, window)
schema:{connectionId}  → CachedSchema (schema, cachedAt, expiresAt)
```

---

## 3. Optimizaciones Propuestas

---

### OPT-1: Skip Rate Limit para Métodos Públicos

**Prioridad:** Alta
**Complejidad:** Baja
**Fase:** 1

#### 3.1.1 Descripción

Los métodos públicos del protocolo MCP (`initialize`, `initialized`, `tools/list`, `ping`) no requieren autenticación y representan operaciones de bajo riesgo. Actualmente se les aplica rate limiting innecesariamente.

#### 3.1.2 Implementación Propuesta

**Archivo:** `src/index.ts`

```typescript
// Antes
const rateLimitResult = await checkRateLimit(env.SESSIONS, rateLimitId);

// Después
const requiresRateLimit = methodRequiresAuth(rpcRequest.method);
let rateLimitResult: RateLimitResult | null = null;

if (requiresRateLimit) {
  rateLimitResult = await checkRateLimit(env.SESSIONS, rateLimitId);
  if (!rateLimitResult.allowed) {
    return createRateLimitResponse(rateLimitResult);
  }
}
```

#### 3.1.3 Impacto Esperado

| Método | Antes | Después | Reducción |
|--------|-------|---------|-----------|
| `initialize` | 2 ops | **0 ops** | -100% |
| `tools/list` | 2 ops | **0 ops** | -100% |
| `ping` | 2 ops | **0 ops** | -100% |

#### 3.1.4 Riesgos y Contraindicaciones

| Riesgo | Severidad | Probabilidad | Mitigación |
|--------|-----------|--------------|------------|
| **Ataque DDoS a métodos públicos** | Media | Baja | Los métodos públicos son idempotentes y de bajo costo computacional. Cloudflare tiene protección DDoS a nivel de red. |
| **Abuso de `tools/list` para reconocimiento** | Baja | Media | `tools/list` solo expone metadata pública de herramientas, no información sensible. |
| **Inconsistencia en headers de respuesta** | Baja | Alta | Las respuestas sin rate limit no incluirán headers `X-RateLimit-*`. Documentar este comportamiento. |

**Contraindicaciones:**
- No aplicar si se añaden métodos públicos que consuman recursos significativos
- Reconsiderar si se detecta abuso de endpoints públicos en logs

---

### OPT-2: Lazy Write para Rate Limit

**Prioridad:** Alta
**Complejidad:** Baja
**Fase:** 1

#### 3.2.1 Descripción

Actualmente, cada request autenticada escribe el contador de rate limit en KV. Esta optimización reduce las escrituras escribiendo solo cuando:
1. Es la primera request de una ventana temporal
2. El contador supera el 50% del límite

#### 3.2.2 Implementación Propuesta

**Archivo:** `src/security/ratelimit.ts`

```typescript
// Antes
if (allowed) {
  await kv.put(key, JSON.stringify(entry), { expirationTtl });
}

// Después
const isFirstInWindow = count === 1;
const isApproachingLimit = count > (config.maxRequests * 0.5);
const shouldWrite = isFirstInWindow || isApproachingLimit;

if (allowed && shouldWrite) {
  await kv.put(key, JSON.stringify(entry), { expirationTtl });
}
```

#### 3.2.3 Impacto Esperado

- **Reducción de escrituras:** ~50% en usuarios con uso normal
- **Ahorro por request:** 1 operación de escritura en ~50% de los casos

| Escenario | Antes | Después |
|-----------|-------|---------|
| Usuario con < 50 req/min | 1W por request | 1W primera + 0W resto |
| Usuario con > 50 req/min | 1W por request | 1W por request |

#### 3.2.4 Riesgos y Contraindicaciones

| Riesgo | Severidad | Probabilidad | Mitigación |
|--------|-----------|--------------|------------|
| **Contador desactualizado en KV** | Media | Alta | El contador real puede ser mayor que el almacenado. Solo afecta lecturas desde otras instancias del Worker. |
| **Bypass parcial de rate limit** | Media | Media | Un usuario podría hacer hasta ~50 requests adicionales antes de que el límite se aplique correctamente. |
| **Inconsistencia entre instancias** | Baja | Media | Diferentes instancias del Worker pueden tener contadores diferentes. Aceptable para rate limiting no crítico. |
| **Headers `X-RateLimit-Remaining` inexactos** | Baja | Alta | Los headers mostrarán valores aproximados, no exactos. |

**Contraindicaciones:**
- No usar si el rate limiting debe ser estrictamente preciso (ej: facturación por uso)
- No usar si hay requisitos de compliance que exijan conteo exacto
- Reconsiderar si los usuarios dependen de headers de rate limit para throttling client-side

**Nota:** Esta optimización intercambia precisión por rendimiento. Es apropiada para rate limiting de protección, no para rate limiting de facturación.

---

### OPT-3: Caché In-Memory del Worker

**Prioridad:** Media
**Complejidad:** Media
**Fase:** 2

#### 3.3.1 Descripción

Cloudflare Workers mantienen estado en memoria entre requests que llegan a la misma instancia. Implementar un caché en memoria para sesiones y rate limits reduce lecturas KV para requests frecuentes.

#### 3.3.2 Implementación Propuesta

**Nuevo archivo:** `src/utils/memory-cache.ts`

```typescript
interface CacheEntry<T> {
  data: T;
  cachedAt: number;
}

class MemoryCache<T> {
  private cache = new Map<string, CacheEntry<T>>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(ttlSeconds: number = 30, maxEntries: number = 1000) {
    this.ttlMs = ttlSeconds * 1000;
    this.maxEntries = maxEntries;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.cachedAt > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  set(key: string, data: T): void {
    // Eviction simple si excede límite
    if (this.cache.size >= this.maxEntries) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) this.cache.delete(firstKey);
    }

    this.cache.set(key, { data, cachedAt: Date.now() });
  }

  delete(key: string): void {
    this.cache.delete(key);
  }
}

// Instancias globales (persisten entre requests en misma instancia)
export const sessionCache = new MemoryCache<SessionData>(30, 1000);
export const rateLimitCache = new MemoryCache<RateLimitEntry>(10, 5000);
```

**Modificación en:** `src/auth/session.ts`

```typescript
import { sessionCache } from '../utils/memory-cache.js';

export async function getSession(kv: KVNamespace, token: string): Promise<SessionData | null> {
  // Intentar caché en memoria primero
  const cached = sessionCache.get(token);
  if (cached) {
    return cached;
  }

  // Fallback a KV
  const data = await kv.get(getSessionKey(token));
  if (data) {
    const session = JSON.parse(data) as SessionData;
    sessionCache.set(token, session);
    return session;
  }

  return null;
}
```

#### 3.3.3 Impacto Esperado

| Escenario | Reducción Lecturas KV |
|-----------|----------------------|
| Usuario único haciendo múltiples requests | ~80-90% |
| Múltiples usuarios, instancia caliente | ~50-70% |
| Cold start (nueva instancia) | 0% (primera request) |

**Nota:** El impacto real depende del patrón de tráfico y la distribución de requests entre instancias.

#### 3.3.4 Riesgos y Contraindicaciones

| Riesgo | Severidad | Probabilidad | Mitigación |
|--------|-----------|--------------|------------|
| **Sesión revocada no se refleja inmediatamente** | Alta | Media | Usuario podría seguir autenticado hasta 30s después de logout. Reducir TTL de caché de sesión a 10-15s. |
| **Uso de memoria excesivo** | Media | Baja | Limitar `maxEntries` y monitorear. Workers tienen límite de 128MB. |
| **Inconsistencia entre instancias** | Media | Alta | Cada instancia tiene su propio caché. Una sesión válida en una instancia puede no estar en otra. |
| **Rate limit bypass entre instancias** | Media | Media | Si requests van a diferentes instancias, cada una cuenta desde cero en su caché. |
| **Cold starts anulan beneficio** | Baja | Variable | En tráfico bajo, hay más cold starts y menos beneficio del caché. |
| **Datos stale después de actualización** | Media | Media | Si se actualiza la sesión en D1, el caché puede tener datos obsoletos. |

**Contraindicaciones:**
- No cachear sesiones si se requiere revocación inmediata (ej: logout por seguridad)
- No usar TTL largo si los datos de sesión cambian frecuentemente
- Evitar en escenarios de bajo tráfico donde cold starts son frecuentes
- No confiar en este caché para rate limiting crítico de seguridad

**Consideraciones de Seguridad:**
- El caché en memoria NO persiste entre deploys
- El caché NO se comparte entre instancias del Worker
- Un atacante con acceso a la instancia podría leer datos cacheados

---

### OPT-4: Combinar Sesión + Rate Limit en una Sola Key

**Prioridad:** Media
**Complejidad:** Alta
**Fase:** 3

#### 3.4.1 Descripción

Actualmente, sesión y rate limit se almacenan en keys separadas, requiriendo dos lecturas KV. Esta optimización combina ambos en una sola estructura.

#### 3.4.2 Implementación Propuesta

**Nuevo esquema de datos:**

```typescript
// Antes: 2 keys separadas
// Key: session:{token}
interface SessionData {
  userId: string;
  connectionId: string;
  createdAt: number;
  expiresAt: number;
}

// Key: rate:{identifier}
interface RateLimitEntry {
  count: number;
  window: number;
}

// Después: 1 key combinada
// Key: session:{token}
interface CombinedSessionData {
  userId: string;
  connectionId: string;
  createdAt: number;
  expiresAt: number;
  rateLimit: {
    count: number;
    window: number;
  };
}
```

**Modificación en:** `src/auth/session.ts`

```typescript
export async function getSessionWithRateLimit(
  kv: KVNamespace,
  token: string,
  rateLimitConfig: RateLimitConfig
): Promise<{
  session: SessionData | null;
  rateLimit: RateLimitResult;
}> {
  const key = getSessionKey(token);
  const data = await kv.get(key);  // 1 sola lectura

  if (!data) {
    return {
      session: null,
      rateLimit: { allowed: true, current: 0, limit: rateLimitConfig.maxRequests, ... }
    };
  }

  const combined = JSON.parse(data) as CombinedSessionData;

  // Procesar rate limit
  const currentWindow = getCurrentWindow(rateLimitConfig.windowSeconds);
  let count = 1;

  if (combined.rateLimit?.window === currentWindow) {
    count = combined.rateLimit.count + 1;
  }

  const allowed = count <= rateLimitConfig.maxRequests;

  // Actualizar y guardar (1 sola escritura)
  if (allowed) {
    combined.rateLimit = { count, window: currentWindow };
    await kv.put(key, JSON.stringify(combined), {
      expirationTtl: Math.ceil((combined.expiresAt - Date.now()) / 1000)
    });
  }

  return {
    session: {
      userId: combined.userId,
      connectionId: combined.connectionId,
      createdAt: combined.createdAt,
      expiresAt: combined.expiresAt,
    },
    rateLimit: { allowed, current: count, ... }
  };
}
```

#### 3.4.3 Impacto Esperado

| Operación | Antes | Después | Reducción |
|-----------|-------|---------|-----------|
| Lectura sesión | 1 GET | 0 GET (combinado) | -100% |
| Lectura rate limit | 1 GET | 0 GET (combinado) | -100% |
| Lectura combinada | N/A | 1 GET | N/A |
| **Total lecturas** | 2 GET | **1 GET** | **-50%** |

#### 3.4.4 Riesgos y Contraindicaciones

| Riesgo | Severidad | Probabilidad | Mitigación |
|--------|-----------|--------------|------------|
| **Migración de datos existentes** | Alta | Segura | Requiere script de migración para convertir sesiones existentes al nuevo formato. Usuarios activos podrían perder sesión. |
| **Rate limit ligado a sesión** | Media | Alta | Si el usuario cierra sesión, pierde el contador de rate limit. Podría permitir bypass reiniciando sesión. |
| **Aumento de tamaño de datos** | Baja | Segura | Cada entrada de sesión es ligeramente más grande. Impacto mínimo. |
| **Complejidad de código aumentada** | Media | Segura | La lógica de sesión y rate limit se entrelazan, dificultando mantenimiento. |
| **Rate limit por IP imposible** | Alta | Segura | Usuarios no autenticados no tienen sesión, por lo que no se les puede aplicar rate limit con este esquema. |
| **Rollback complejo** | Alta | Variable | Revertir requiere otra migración de datos. |
| **Testing más complejo** | Media | Segura | Tests unitarios deben cubrir más casos combinados. |

**Contraindicaciones:**
- **NO implementar** si se requiere rate limiting para usuarios no autenticados
- **NO implementar** si se necesita rate limiting por IP además de por usuario
- Evitar si hay múltiples servicios que leen sesiones independientemente
- No recomendado si la estructura de sesión cambia frecuentemente

**Requisitos previos:**
1. Implementar script de migración
2. Planificar ventana de mantenimiento para migración
3. Comunicar a usuarios posible necesidad de re-autenticarse
4. Mantener compatibilidad temporal con formato antiguo

---

### OPT-5: Rate Limiting Probabilístico

**Prioridad:** Baja
**Complejidad:** Baja
**Fase:** Opcional

#### 3.5.1 Descripción

En lugar de contar cada request exactamente, usar muestreo estadístico para estimar el rate. Solo registrar 1 de cada N requests.

#### 3.5.2 Implementación Propuesta

**Archivo:** `src/security/ratelimit.ts`

```typescript
const SAMPLE_RATE = 0.1; // 10% de requests se registran
const MULTIPLIER = 1 / SAMPLE_RATE; // 10x

export async function checkRateLimitProbabilistic(
  kv: KVNamespace,
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const key = getRateLimitKey(identifier);
  const currentWindow = getCurrentWindow(config.windowSeconds);

  // Leer siempre para verificar límite
  const existing = await kv.get<RateLimitEntry>(key, 'json');

  let estimatedCount = 1;
  if (existing?.window === currentWindow) {
    estimatedCount = existing.count * MULTIPLIER;
  }

  const allowed = estimatedCount <= config.maxRequests;

  // Solo escribir con probabilidad SAMPLE_RATE
  if (allowed && Math.random() < SAMPLE_RATE) {
    const actualCount = existing?.window === currentWindow ? existing.count + 1 : 1;
    await kv.put(key, JSON.stringify({ count: actualCount, window: currentWindow }), {
      expirationTtl: config.windowSeconds * 2,
    });
  }

  return { allowed, current: Math.round(estimatedCount), ... };
}
```

#### 3.5.3 Impacto Esperado

| Métrica | Antes | Después |
|---------|-------|---------|
| Escrituras KV | 100% requests | ~10% requests |
| Precisión del contador | Exacta | ±30% estimada |

#### 3.5.4 Riesgos y Contraindicaciones

| Riesgo | Severidad | Probabilidad | Mitigación |
|--------|-----------|--------------|------------|
| **Imprecisión significativa** | Alta | Segura | El contador puede diferir hasta ±50% del valor real. Usuarios pueden exceder límite o ser bloqueados prematuramente. |
| **Comportamiento no determinístico** | Media | Segura | El mismo usuario puede tener experiencias diferentes en diferentes requests. |
| **Difícil de debuggear** | Media | Alta | Logs y métricas mostrarán valores inconsistentes. |
| **No apto para límites estrictos** | Alta | Segura | Si el límite es 100, usuario podría hacer 150 o ser bloqueado a 70. |
| **Varianza alta en bajo volumen** | Alta | Media | Con pocos requests, la estimación es muy imprecisa. |

**Contraindicaciones:**
- **NO usar** si se requiere precisión en el rate limiting
- **NO usar** para límites bajos (< 50 requests/window)
- **NO usar** si hay requisitos de auditoría o compliance
- No recomendado si los usuarios reportan experiencia inconsistente

**Casos de uso apropiados:**
- Protección contra abuso masivo (miles de requests)
- Rate limiting de "mejor esfuerzo"
- Sistemas donde la experiencia de usuario no depende de límites precisos

---

## 4. Plan de Implementación por Fases

### Fase 1: Quick Wins (Bajo Riesgo)

**Estado:** COMPLETADA
**Fecha de implementación:** 2025-01-09
**Optimizaciones:** OPT-1, OPT-2

```
┌─────────────────────────────────────────────────────────────┐
│                         FASE 1 - COMPLETADA                  │
├─────────────────────────────────────────────────────────────┤
│  OPT-1: Skip rate limit métodos públicos                    │
│  - Modificar: src/index.ts                                  │
│  - Tests: Verificar initialize/tools/list sin rate headers │
│                                                              │
│  OPT-2: Lazy write para rate limit                          │
│  - Modificar: src/security/ratelimit.ts                     │
│  - Tests: Verificar escrituras solo cuando count > 50%      │
└─────────────────────────────────────────────────────────────┘
```

**Checklist:**
- [x] Implementar OPT-1 - Métodos públicos exentos de rate limiting
- [x] Implementar OPT-2 - Lazy write con threshold 50%
- [x] Actualizar tests unitarios (5 nuevos tests añadidos)
- [x] Deploy a staging (2025-01-09)
- [x] Verificar funcionamiento en staging
- [x] Deploy a producción (2026-01-10) - Desplegado junto con fix de schema
- [x] Monitorear métricas (2026-01-10) - Verificado funcionamiento correcto

**Archivos Modificados:**
- `src/index.ts` - Nueva función `methodRequiresRateLimit()`, rate limiting condicional
- `src/security/ratelimit.ts` - Constante `LAZY_WRITE_THRESHOLD`, lógica de lazy write
- `test/unit/security.test.ts` - 5 nuevos tests para lazy write

**Tests:** 181 tests pasando (antes: 144)

**Resultados de Monitoreo (2026-01-10):**

| Verificación | Resultado | Estado |
|--------------|-----------|--------|
| OPT-1: `initialize` sin rate limit headers | ✅ Sin headers X-RateLimit | Funcionando |
| OPT-1: `tools/list` sin rate limit headers | ✅ Sin headers X-RateLimit | Funcionando |
| OPT-2: Lazy write (5 requests consecutivas) | ✅ Solo 1-2 escrituras KV | Funcionando |
| Rate limit en métodos autenticados | ✅ Headers presentes (100 limit) | Funcionando |
| Caché de schema (primera llamada) | 2.18s (extracción Neo4j) | Funcionando |
| Caché de schema (segunda llamada) | 0.11s (cache hit, 20x más rápido) | Funcionando |

**Operaciones KV Medidas:**

| Tipo de Request | Ops KV Antes | Ops KV Ahora | Reducción |
|-----------------|--------------|--------------|-----------|
| Métodos públicos (`initialize`, `tools/list`) | 2 | **0** | **-100%** |
| Métodos autenticados (uso normal) | 3 | **~1.5** | **-50%** |
| `get_neo4j_schema` (cache hit) | 4 | **~2** | **-50%** |

**Conclusión Fase 1:** ✅ Objetivos cumplidos. Reducción promedio de ~50% en operaciones KV.

---

### Fase 2: Caché In-Memory (Riesgo Medio)

**Duración estimada:** 3-4 horas
**Optimizaciones:** OPT-3
**Prerequisitos:** Fase 1 completada

```
┌─────────────────────────────────────────────────────────────┐
│                         FASE 2                               │
├─────────────────────────────────────────────────────────────┤
│  OPT-3: Caché in-memory del Worker                          │
│  - Crear: src/utils/memory-cache.ts                         │
│  - Modificar: src/auth/session.ts                           │
│  - Modificar: src/security/ratelimit.ts                     │
│  - Tests: Verificar cache hit/miss                          │
│  - Configurar: TTL y maxEntries                             │
└─────────────────────────────────────────────────────────────┘
```

**Checklist:**
- [ ] Implementar MemoryCache class
- [ ] Integrar en getSession()
- [ ] Integrar en checkRateLimit()
- [ ] Añadir métricas de cache hit/miss
- [ ] Tests unitarios para caché
- [ ] Tests de invalidación
- [ ] Deploy a staging
- [ ] Load testing para verificar beneficio
- [ ] Deploy a producción
- [ ] Monitorear memoria del Worker

**Resultado esperado:**
- Reducción adicional de 30-50% en lecturas KV
- Latencia reducida en requests repetidas

---

### Fase 3: Refactoring Mayor (Riesgo Alto)

**Duración estimada:** 6-8 horas
**Optimizaciones:** OPT-4
**Prerequisitos:** Fases 1 y 2 completadas, métricas baseline establecidas

```
┌─────────────────────────────────────────────────────────────┐
│                         FASE 3                               │
├─────────────────────────────────────────────────────────────┤
│  OPT-4: Combinar sesión + rate limit                        │
│  - Crear script de migración                                │
│  - Modificar: src/types.ts (CombinedSessionData)            │
│  - Modificar: src/auth/session.ts                           │
│  - Eliminar: rate limit separado para usuarios auth         │
│  - Mantener: rate limit por IP para no autenticados         │
│  - Tests: Migración, compatibilidad, edge cases             │
└─────────────────────────────────────────────────────────────┘
```

**Checklist:**
- [ ] Diseñar esquema CombinedSessionData
- [ ] Implementar script de migración
- [ ] Probar migración en staging con datos reales
- [ ] Implementar nuevo getSessionWithRateLimit()
- [ ] Mantener rate limit por IP para no auth
- [ ] Tests de compatibilidad
- [ ] Tests de migración
- [ ] Planificar ventana de mantenimiento
- [ ] Comunicar a usuarios
- [ ] Ejecutar migración en producción
- [ ] Deploy código nuevo
- [ ] Monitorear errores 48h
- [ ] Eliminar código legacy después de estabilización

**Resultado esperado:**
- Reducción de 50% en operaciones KV para requests autenticadas
- Simplificación del modelo de datos a largo plazo

---

## 5. Métricas de Éxito

### 5.1 KPIs a Monitorear

| Métrica | Baseline | Objetivo Fase 1 | Objetivo Fase 2 | Objetivo Fase 3 |
|---------|----------|-----------------|-----------------|-----------------|
| Ops KV / request (público) | 2.0 | **0.0** | 0.0 | 0.0 |
| Ops KV / request (auth) | 3.0 | **2.5** | **1.5** | **1.0** |
| Latencia p50 (ms) | TBD | -10% | -20% | -30% |
| Latencia p99 (ms) | TBD | -5% | -15% | -25% |
| Errores rate limit falsos | 0 | < 1% | < 2% | < 1% |

### 5.2 Alertas a Configurar

- Operaciones KV/minuto > threshold
- Cache hit ratio < 50% (Fase 2)
- Errores de autenticación aumentan > 10%
- Latencia p99 aumenta > 20%

---

## 6. Decisión: Fase Recomendada

### Recomendación Inicial: Implementar Fase 1

**Justificación:**
1. **Bajo riesgo:** Cambios mínimos y reversibles
2. **Alto impacto:** Elimina 100% de operaciones en métodos públicos
3. **Rápido:** Implementable en 1-2 horas
4. **Sin migración:** No requiere cambios en datos existentes

### Evaluación para Fases Posteriores

Después de completar Fase 1, evaluar:
- ¿El volumen de operaciones KV sigue siendo problemático?
- ¿Los límites del plan de Cloudflare se están alcanzando?
- ¿La latencia es aceptable para los usuarios?

Si las respuestas son afirmativas, proceder con Fase 2. Fase 3 solo si hay necesidad clara y recursos para migración.

---

## 7. Registro de Cambios

| Fecha | Versión | Cambio |
|-------|---------|--------|
| 2025-01-09 | 2.0 | Documento inicial con 5 optimizaciones propuestas |
| 2025-01-09 | 2.1 | Fase 1 implementada: OPT-1 y OPT-2 completadas, 181 tests pasando |
| 2025-01-09 | 2.2 | Staging desplegado y verificado. Producción pendiente de ventana de mantenimiento |
| 2026-01-10 | 2.3 | **Fase 1 desplegada en producción** junto con fix de bug schema undefined length |
| 2026-01-10 | 2.4 | **Monitoreo completado.** Fase 1 verificada: -100% ops en públicos, -50% en autenticados |

---

**Fin del documento Roadmap_v2.md**
