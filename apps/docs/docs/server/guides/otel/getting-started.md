---
sidebar_position: 1
---

# Getting Started with OpenTelemetry

Navios provides first-class OpenTelemetry integration through three packages:

- **@navios/otel** - Core abstractions and shared functionality
- **@navios/otel-fastify** - Fastify adapter integration
- **@navios/otel-bun** - Bun adapter integration

## Installation

### For Fastify

```bash
# Core packages
yarn add @navios/otel @navios/otel-fastify @opentelemetry/api

# For OTLP export (Jaeger, Tempo, Grafana, etc.)
yarn add @opentelemetry/exporter-trace-otlp-http

# Optional: For metrics export
yarn add @opentelemetry/exporter-metrics-otlp-http
```

### For Bun

```bash
# Core packages
yarn add @navios/otel @navios/otel-bun @opentelemetry/api

# For OTLP export
yarn add @opentelemetry/exporter-trace-otlp-http
```

## Basic Setup

### Fastify Adapter

```typescript
import { NaviosFactory } from '@navios/core'
import { FastifyApplicationService } from '@navios/adapter-fastify'
import { defineOtelPlugin } from '@navios/otel-fastify'

const app = await NaviosFactory.create(FastifyApplicationService, {
  module: AppModule,
})

app.usePlugin(defineOtelPlugin({
  serviceName: 'my-api',
  exporter: 'otlp',
  exporterOptions: {
    endpoint: 'http://localhost:4318/v1/traces',
  },
  autoInstrument: {
    http: true,
    handlers: true,
  },
}))

await app.listen({ port: 3000 })
```

### Bun Adapter

```typescript
import { NaviosFactory } from '@navios/core'
import { BunApplicationService } from '@navios/adapter-bun'
import { defineOtelPlugin } from '@navios/otel-bun'

const app = await NaviosFactory.create(BunApplicationService, {
  module: AppModule,
})

// defineOtelPlugin returns an array of staged plugins
for (const plugin of defineOtelPlugin({
  serviceName: 'my-bun-api',
  exporter: 'console', // For development
  autoInstrument: {
    http: true,      // Enable HTTP tracing (default)
    handlers: true,  // Trace guard execution
  },
  ignoreRoutes: ['/health', '/metrics'],  // Optional: skip tracing these
})) {
  app.usePlugin(plugin)
}

await app.listen({ port: 3000 })
```

:::note
The Bun adapter uses staged plugins to register the traced controller adapter before the application initializes. This enables automatic HTTP request tracing with full controller and handler metadata.
:::

## Performance Considerations

Tracing adds overhead to every request. The amount depends on your configuration:

| Configuration | Overhead | Use Case |
|--------------|----------|----------|
| HTTP spans only | ~0.1-0.5ms | Production with basic observability |
| HTTP + handlers | ~0.5-1ms | Production with detailed insights |
| Full instrumentation | ~1-3ms | Development/debugging |
| With sampling (10%) | Minimal | High-traffic production |

See [Configuration Presets](./configuration-presets) for ready-to-use configurations.

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `serviceName` | `string` | **required** | Name of your service |
| `serviceVersion` | `string` | - | Version of your service |
| `environment` | `string` | - | Deployment environment |
| `exporter` | `'otlp' \| 'console' \| 'none'` | **required** | Where to send traces |
| `exporterOptions.endpoint` | `string` | - | OTLP endpoint URL |
| `exporterOptions.headers` | `Record<string, string>` | - | Headers for authentication |
| `autoInstrument.http` | `boolean` | `true` | Trace HTTP requests |
| `autoInstrument.handlers` | `boolean` | `true` | Trace handler methods |
| `autoInstrument.guards` | `boolean` | `false` | Trace guard execution |
| `metrics.enabled` | `boolean` | `false` | Enable metrics collection |
| `includeNaviosAttributes` | `boolean` | `false` | Add `navios.*` attributes |
| `sampling.ratio` | `number` | `1.0` | Sample ratio (0-1) |
| `ignoreRoutes` | `string[]` | `[]` | Routes to skip tracing (supports `*` wildcards) |

## Next Steps

- [Configuration Presets](./configuration-presets) - Ready-to-use configurations for different scenarios
- Configure [exporters](./exporters) for your backend
- Learn about the [@Traced decorator](./traced-decorator)
- Set up [metrics collection](./metrics)
