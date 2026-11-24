---
sidebar_position: 2
---

# Exporters

Navios OTel supports multiple exporters for sending traces to different backends.

## OTLP Exporter

The OTLP (OpenTelemetry Protocol) exporter is the recommended choice for production. It works with most observability platforms:

- Jaeger
- Grafana Tempo
- Honeycomb
- Datadog
- New Relic
- And many more...

### Installation

```bash
yarn add @opentelemetry/exporter-trace-otlp-http
```

### Configuration

```typescript
app.usePlugin(defineOtelPlugin({
  serviceName: 'my-api',
  exporter: 'otlp',
  exporterOptions: {
    // OTLP HTTP endpoint
    endpoint: 'http://localhost:4318/v1/traces',

    // Optional: Authentication headers
    headers: {
      'Authorization': 'Bearer your-token',
    },
  },
  // ... other options
}))
```

### Common Endpoints

| Platform | Endpoint |
|----------|----------|
| Jaeger | `http://localhost:4318/v1/traces` |
| Grafana Tempo | `http://localhost:4318/v1/traces` |
| Honeycomb | `https://api.honeycomb.io/v1/traces` |
| Datadog | `https://trace.agent.datadoghq.com/v1/traces` |

## Console Exporter

Useful for development and debugging. Prints spans to the console:

```typescript
app.usePlugin(defineOtelPlugin({
  serviceName: 'my-api',
  exporter: 'console',
  autoInstrument: {
    http: true,
  },
}))
```

Example output:

```
{
  "traceId": "abc123...",
  "spanId": "def456...",
  "name": "HTTP GET /users/:id",
  "duration": 15.2,
  "attributes": {
    "http.method": "GET",
    "http.url": "/users/123",
    "http.status_code": 200
  }
}
```

## None (Disabled)

Disables trace export while keeping tracing infrastructure active:

```typescript
app.usePlugin(defineOtelPlugin({
  serviceName: 'my-api',
  exporter: 'none',
  // Spans are created but not exported
}))
```

Useful for:
- Testing
- Local development without an observability backend
- Gradual rollout

## Environment-Based Configuration

Use environment variables for flexible deployment:

```typescript
const exporter = process.env.OTEL_EXPORTER as 'otlp' | 'console' | 'none'
const endpoint = process.env.OTEL_ENDPOINT

app.usePlugin(defineOtelPlugin({
  serviceName: process.env.SERVICE_NAME || 'my-api',
  serviceVersion: process.env.SERVICE_VERSION,
  environment: process.env.NODE_ENV,
  exporter: exporter || 'console',
  exporterOptions: endpoint ? { endpoint } : undefined,
  autoInstrument: {
    http: true,
    handlers: true,
  },
}))
```

Example `.env` file:

```bash
SERVICE_NAME=my-api
SERVICE_VERSION=1.0.0
OTEL_EXPORTER=otlp
OTEL_ENDPOINT=http://jaeger:4318/v1/traces
```
