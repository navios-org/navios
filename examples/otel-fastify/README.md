# OpenTelemetry Fastify Example

This example demonstrates how to integrate OpenTelemetry with a Navios Fastify application for full observability (traces, metrics, and logs).

## Quick Start

1. **Start the observability stack:**

```bash
yarn docker:up
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
yarn start
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

Open http://localhost:16686 and select `otel-fastify-example` from the service dropdown.

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
| `OTEL_SERVICE_NAME` | Service name in traces | `otel-fastify-example` |
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
| `OTEL_INCLUDE_NAVIOS_ATTRIBUTES` | Add Navios span attributes | `false` |

### Metrics & Sampling

| Variable | Description | Default |
|----------|-------------|---------|
| `OTEL_METRICS_ENABLED` | Enable metrics collection | `false` |
| `OTEL_LOGS_ENABLED` | Enable logs export | `false` |
| `OTEL_SAMPLING_RATIO` | Sampling ratio (0.0-1.0) | `1.0` |
| `OTEL_IGNORE_ROUTES` | Comma-separated routes to ignore | `/health` |

## How tracing is set up

One plugin from `@navios/otel` does everything, and it is the same on every adapter:

```typescript
import { otelPlugin } from '@navios/otel'

const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
  plugins: [otelPlugin(getOtelConfig())],
})
```

- Every request that matches a route gets a server span named `HTTP <METHOD> <route>`, for example `HTTP GET /items/$id`.
- A handler reaches that span with `ctx.find(RequestSpan)` (see `items.controller.mts`).
- Spans are flushed when the application closes; `bootstrap.mts` calls `app.close()` on `SIGINT` and `SIGTERM`.

## Using the @Traced Decorator

The `@Traced` decorator makes a service start a child span around its method calls:

```typescript
import { Injectable } from '@navios/server/legacy-compat'
import { Traceable, Traced } from '@navios/otel/legacy-compat'

// Trace all methods in the class
@Injectable()
@Traced({ name: 'my-service' })
export class MyService {
  async doSomething() {
    // Creates span: "my-service.doSomething"
  }
}

// Trace specific methods: mark the class with @Traceable
@Injectable()
@Traceable()
export class AnotherService {
  @Traced({ name: 'critical-operation', attributes: { critical: true } })
  async criticalOperation() {
    // Creates span: "critical-operation" with custom attributes
  }
}
```

This example uses TypeScript's legacy decorators (`experimentalDecorators`), hence the `legacy-compat` imports. With standard decorators, import from `@navios/server` and `@navios/otel`.

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────┐
│  Fastify App    │────▶│  OTel Collector  │────▶│ Jaeger  │ (traces)
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
yarn docker:down
```
