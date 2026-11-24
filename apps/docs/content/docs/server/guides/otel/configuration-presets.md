---
sidebar_position: 1
---

# Configuration Presets

Choose a preset based on your environment and observability needs. Each preset balances detail against performance overhead.

## Preset Comparison

| Preset | HTTP Spans | Handler Spans | Guards | Navios Attrs | Sampling | Best For |
|--------|------------|---------------|--------|--------------|----------|----------|
| **Minimal** | Yes | No | No | No | 100% | Production, low overhead |
| **Standard** | Yes | Yes | No | No | 100% | Production, balanced |
| **Detailed** | Yes | Yes | No | Yes | 100% | Staging, debugging |
| **Debug** | Yes | Yes | Yes | Yes | 100% | Development only |
| **High Traffic** | Yes | No | No | No | 10% | High-volume production |

---

## Minimal (Production - Low Overhead)

Best for: **Production environments where every millisecond matters**

Creates one span per HTTP request with basic attributes. Lowest overhead while still providing request-level visibility.

```typescript
defineOtelPlugin({
  serviceName: 'my-api',
  serviceVersion: '1.0.0',
  environment: 'production',
  exporter: 'otlp',
  exporterOptions: {
    endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  },
  autoInstrument: {
    http: true,
    handlers: false,  // Skip handler-level spans
    guards: false,
  },
  includeNaviosAttributes: false,
})
```

**What you get:**
- Request duration and status codes
- Route patterns (e.g., `/users/:id`)
- Error tracking
- Distributed trace context propagation

**Overhead:** ~0.1-0.5ms per request

---

## Standard (Production - Balanced)

Best for: **Most production environments**

Adds handler-level spans to see which controller methods are slow. Good balance of insight and performance.

```typescript
defineOtelPlugin({
  serviceName: 'my-api',
  serviceVersion: '1.0.0',
  environment: 'production',
  exporter: 'otlp',
  exporterOptions: {
    endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  },
  autoInstrument: {
    http: true,
    handlers: true,  // Include handler spans
    guards: false,
  },
  includeNaviosAttributes: false,
  ignoreRoutes: ['/health', '/metrics', '/ready'],
})
```

**What you get:**
- Everything from Minimal, plus:
- Handler execution time breakdown
- Identify slow controller methods

**Overhead:** ~0.5-1ms per request

---

## Detailed (Staging/Debugging)

Best for: **Staging environments or production debugging sessions**

Includes Navios-specific attributes for easier debugging. Useful when investigating issues.

```typescript
defineOtelPlugin({
  serviceName: 'my-api',
  serviceVersion: '1.0.0',
  environment: 'staging',
  exporter: 'otlp',
  exporterOptions: {
    endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  },
  autoInstrument: {
    http: true,
    handlers: true,
    guards: false,
  },
  includeNaviosAttributes: true,  // Add navios.controller, navios.handler
  ignoreRoutes: ['/health', '/metrics'],
})
```

**What you get:**
- Everything from Standard, plus:
- `navios.controller` - Controller class name
- `navios.handler` - Handler method name
- `navios.module` - Module name (when available)

**Overhead:** ~1-2ms per request

---

## Debug (Development Only)

Best for: **Local development and debugging**

Maximum detail including guard execution. **Not recommended for production** due to high overhead.

```typescript
defineOtelPlugin({
  serviceName: 'my-api-dev',
  environment: 'development',
  exporter: 'console',  // Print to console for easy viewing
  autoInstrument: {
    http: true,
    handlers: true,
    guards: true,  // Include guard spans
  },
  includeNaviosAttributes: true,
  // No ignoreRoutes - trace everything
})
```

**What you get:**
- Everything from Detailed, plus:
- Guard execution spans
- Console output for immediate visibility

**Overhead:** ~2-5ms per request

---

## High Traffic (Production - Sampled)

Best for: **High-volume APIs (>1000 req/s) where full tracing is too expensive**

Uses sampling to trace only a percentage of requests while maintaining statistical accuracy.

```typescript
defineOtelPlugin({
  serviceName: 'my-api',
  serviceVersion: '1.0.0',
  environment: 'production',
  exporter: 'otlp',
  exporterOptions: {
    endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  },
  autoInstrument: {
    http: true,
    handlers: false,
    guards: false,
  },
  sampling: {
    ratio: 0.1,  // Sample 10% of requests
  },
  includeNaviosAttributes: false,
  ignoreRoutes: ['/health', '/metrics', '/ready'],
})
```

**What you get:**
- Statistical sampling of requests
- Representative performance data
- Minimal production overhead

**Overhead:** Minimal (only 10% of requests are traced)

---

## Environment-Based Configuration

Use environment variables to switch presets:

```typescript
const isProduction = process.env.NODE_ENV === 'production'
const isHighTraffic = process.env.HIGH_TRAFFIC === 'true'

defineOtelPlugin({
  serviceName: process.env.SERVICE_NAME || 'my-api',
  serviceVersion: process.env.SERVICE_VERSION,
  environment: process.env.NODE_ENV,
  exporter: isProduction ? 'otlp' : 'console',
  exporterOptions: {
    endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
  },
  autoInstrument: {
    http: true,
    handlers: !isHighTraffic,  // Disable for high traffic
    guards: !isProduction,     // Only in dev
  },
  sampling: isHighTraffic ? { ratio: 0.1 } : undefined,
  includeNaviosAttributes: !isProduction,
  ignoreRoutes: ['/health', '/metrics', '/ready'],
})
```

## Recommended Ignore Routes

Always exclude health check and metrics endpoints to reduce noise:

```typescript
ignoreRoutes: [
  '/health',
  '/healthz',
  '/ready',
  '/readyz',
  '/metrics',
  '/favicon.ico',
  '/robots.txt',
]
```
