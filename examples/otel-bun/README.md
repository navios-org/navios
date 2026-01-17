# OpenTelemetry Bun Example

This example demonstrates how to integrate OpenTelemetry with a Navios Bun application for full observability (traces, metrics, and logs).

## Prerequisites

- [Bun](https://bun.sh/) installed
- Docker and Docker Compose (for observability stack)

## Quick Start

1. **Start the observability stack:**

```bash
bun run docker:up
```

This starts:
- **Jaeger** (traces) - http://localhost:16686
- **Prometheus** (metrics) - http://localhost:9090
- **Grafana** (dashboards) - http://localhost:3001 (admin/admin)
- **Loki** (logs)
- **OpenTelemetry Collector** (routing)

2. **Configure environment:**

```bash
cp .env.development .env
```

3. **Start the application:**

```bash
bun run start
```

4. **Generate some traces:**

```bash
# Create an item
curl -X POST http://localhost:3000/items \
  -H "Content-Type: application/json" \
  -d '{"name": "Widget", "price": 9.99, "category": "tools"}'

# List items
curl http://localhost:3000/items

# Test slow operation (visible in Jaeger as long span)
curl "http://localhost:3000/slow?delay=2000"

# Test nested spans
curl "http://localhost:3000/chain?depth=5"

# Test error traces
curl "http://localhost:3000/error?type=validation"
```

5. **View traces in Jaeger:**

Open http://localhost:16686 and select `otel-bun-example` from the service dropdown.

## Environment Configurations

Several pre-configured environment files are provided:

| File | Description |
|------|-------------|
| `.env.development` | Full telemetry to local Jaeger |
| `.env.production` | Through OTel Collector, 10% sampling |
| `.env.console` | Print telemetry to console |
| `.env.disabled` | All telemetry disabled |

Copy the desired configuration:

```bash
cp .env.development .env  # or .env.production, etc.
```

## Environment Variables

### Service Identification

| Variable | Description | Default |
|----------|-------------|---------|
| `OTEL_SERVICE_NAME` | Service name in traces | `otel-bun-example` |
| `OTEL_SERVICE_VERSION` | Service version | `1.0.0` |
| `OTEL_ENVIRONMENT` | Deployment environment | `development` |

### Exporter Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `OTEL_EXPORTER` | Export type: `otlp`, `console`, `none` | `console` |
| `OTEL_TRACES_ENDPOINT` | OTLP traces endpoint | `http://localhost:4318/v1/traces` |
| `OTEL_METRICS_ENDPOINT` | OTLP metrics endpoint | `http://localhost:4318/v1/metrics` |
| `OTEL_LOGS_ENDPOINT` | OTLP logs endpoint | `http://localhost:4318/v1/logs` |
| `OTEL_USE_HTTP` | Use HTTP instead of gRPC | `true` |
| `OTEL_HEADERS` | JSON headers for auth | - |

### Auto-Instrumentation

| Variable | Description | Default |
|----------|-------------|---------|
| `OTEL_AUTO_INSTRUMENT_HTTP` | Instrument HTTP requests | `true` |
| `OTEL_AUTO_INSTRUMENT_HANDLERS` | Instrument handlers | `true` |
| `OTEL_AUTO_INSTRUMENT_GUARDS` | Instrument guards | `false` |
| `OTEL_INCLUDE_NAVIOS_ATTRIBUTES` | Add Navios span attributes | `false` |

### Metrics & Sampling

| Variable | Description | Default |
|----------|-------------|---------|
| `OTEL_METRICS_ENABLED` | Enable metrics collection | `false` |
| `OTEL_LOGS_ENABLED` | Enable logs export | `false` |
| `OTEL_SAMPLING_RATIO` | Sampling ratio (0.0-1.0) | `1.0` |
| `OTEL_IGNORE_ROUTES` | Comma-separated routes to ignore | `/health` |

## Using the @Traced Decorator

The `@Traced` decorator adds manual tracing to services:

```typescript
import { Injectable } from '@navios/core/legacy-compat'
import { Traced } from '@navios/otel/legacy-compat'

// Trace all methods in the class
@Injectable()
@Traced({ name: 'my-service' })
export class MyService {
  async doSomething() {
    // Creates span: "my-service.doSomething"
  }
}

// Trace specific methods
@Injectable()
export class AnotherService {
  @Traced({ name: 'critical-operation', attributes: { critical: true } })
  async criticalOperation() {
    // Creates span: "critical-operation" with custom attributes
  }
}
```

## Bun vs Fastify Plugin Differences

The Bun OTEL plugin uses a staged plugin architecture:

```typescript
// Fastify - single plugin
app.usePlugin(defineOtelPlugin(config))

// Bun - array of staged plugins
for (const pluginDef of defineOtelPlugin(config)) {
  app.usePlugin(pluginDef)
}
```

This is because Bun's adapter requires plugin registration at multiple stages:
1. `pre:adapter-resolve` - Registers traced controller adapter
2. `post:modules-init` - Initializes OpenTelemetry SDK

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────┐
│   Bun App       │────▶│  OTel Collector  │────▶│ Jaeger  │ (traces)
│  with OTEL      │     │                  │────▶│Prometheus│ (metrics)
│  Plugin         │     │                  │────▶│  Loki   │ (logs)
└─────────────────┘     └──────────────────┘     └─────────┘
                                                       │
                                                       ▼
                                                 ┌─────────┐
                                                 │ Grafana │ (dashboards)
                                                 └─────────┘
```

## Cleanup

```bash
bun run docker:down
```
