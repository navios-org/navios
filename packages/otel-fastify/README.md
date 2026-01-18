# @navios/otel-fastify

OpenTelemetry integration for Navios Fastify adapter. This package provides automatic tracing for HTTP requests handled by Fastify.

## Installation

```bash
yarn add @navios/otel @navios/otel-fastify @opentelemetry/api

# For OTLP export
yarn add @opentelemetry/exporter-trace-otlp-http
```

## Usage

```typescript
import { NaviosFactory } from '@navios/core'
import { FastifyApplicationService } from '@navios/adapter-fastify'
import { defineOtelPlugin } from '@navios/otel-fastify'

const app = await NaviosFactory.create(FastifyApplicationService, {
  module: AppModule,
})

app.usePlugin(
  defineOtelPlugin({
    serviceName: 'my-api',
    serviceVersion: '1.0.0',
    environment: 'production',

    // Exporter configuration
    exporter: 'otlp',
    exporterOptions: {
      endpoint: 'http://localhost:4318/v1/traces',
      headers: {
        Authorization: 'Bearer token',
      },
    },

    // Auto-instrumentation
    autoInstrument: {
      http: true, // Trace HTTP requests
      handlers: true, // Trace controller handlers
      guards: false, // Trace guard execution
    },

    // Metrics (optional)
    metrics: {
      enabled: true,
    },

    // Ignore certain routes
    ignoreRoutes: ['/health', '/metrics', '/docs/*'],
  }),
)

await app.listen({ port: 3000 })
```

## Configuration Options

| Option                    | Type                            | Default      | Description               |
| ------------------------- | ------------------------------- | ------------ | ------------------------- |
| `serviceName`             | `string`                        | **required** | Name of the service       |
| `serviceVersion`          | `string`                        | `undefined`  | Version of the service    |
| `environment`             | `string`                        | `undefined`  | Deployment environment    |
| `exporter`                | `'otlp' \| 'console' \| 'none'` | **required** | Export destination        |
| `exporterOptions`         | `object`                        | `undefined`  | Exporter-specific options |
| `autoInstrument.http`     | `boolean`                       | `true`       | Trace HTTP requests       |
| `autoInstrument.handlers` | `boolean`                       | `true`       | Trace handlers            |
| `autoInstrument.guards`   | `boolean`                       | `false`      | Trace guards              |
| `metrics.enabled`         | `boolean`                       | `false`      | Enable metrics            |
| `ignoreRoutes`            | `string[]`                      | `[]`         | Routes to skip            |
| `includeNaviosAttributes` | `boolean`                       | `false`      | Add navios.\* attributes  |
| `sampling.ratio`          | `number`                        | `1.0`        | Sample ratio (0-1)        |

## Accessing Spans

The current span is attached to the Fastify request:

```typescript
import type { FastifyRequest } from 'fastify'

function handler(request: FastifyRequest) {
  const span = request.otelSpan
  if (span) {
    span.setAttribute('custom.attribute', 'value')
  }
}
```

## Manual Tracing

Use `@Traced` decorator for explicit tracing:

```typescript
import { Injectable } from '@navios/di'
import { Traced } from '@navios/otel'

@Injectable()
@Traced({ name: 'user-service' })
class UserService {
  async getUser(id: string) {
    // Automatically creates span
  }
}
```

## License

MIT
