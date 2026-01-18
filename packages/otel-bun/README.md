# @navios/otel-bun

OpenTelemetry integration for Navios Bun adapter. This package provides automatic tracing for HTTP requests handled by Bun.

## Installation

```bash
yarn add @navios/otel @navios/otel-bun @opentelemetry/api

# For OTLP export
yarn add @opentelemetry/exporter-trace-otlp-http
```

## Usage

```typescript
import { NaviosFactory } from '@navios/core'
import { BunApplicationService } from '@navios/adapter-bun'
import { defineOtelPlugin } from '@navios/otel-bun'

const app = await NaviosFactory.create(BunApplicationService, {
  module: AppModule,
})

app.usePlugin(
  defineOtelPlugin({
    serviceName: 'my-bun-api',
    serviceVersion: '1.0.0',
    environment: 'production',

    // Exporter configuration
    exporter: 'otlp',
    exporterOptions: {
      endpoint: 'http://localhost:4318/v1/traces',
    },

    // Auto-instrumentation
    autoInstrument: {
      http: true,
      handlers: true,
    },

    // Ignore certain routes
    ignoreRoutes: ['/health', '/metrics'],
  }),
)

await app.listen({ port: 3000 })
```

## Bun-Specific Notes

Unlike Fastify, Bun doesn't have a built-in hook system. For HTTP-level tracing, you have two options:

### Option 1: Use @Traced Decorator

Apply the `@Traced` decorator to your controllers and services:

```typescript
import { Injectable } from '@navios/di'
import { Controller, Endpoint } from '@navios/core'
import { Traced } from '@navios/otel'

@Controller()
@Traced({ name: 'user-controller' })
class UserController {
  @Endpoint(getUserEndpoint)
  async getUser(request: EndpointParams<typeof getUserEndpoint>) {
    // Automatically traced
  }
}

@Injectable()
@Traced({ name: 'user-service' })
class UserService {
  async findUser(id: string) {
    // Automatically traced
  }
}
```

### Option 2: Manual Span Creation

Use the tracer directly for fine-grained control:

```typescript
import { inject, Injectable } from '@navios/di'
import { TracerToken } from '@navios/otel'

@Injectable()
class MyService {
  private readonly tracer = inject(TracerToken)

  async doWork() {
    const span = this.tracer.startSpan('custom-operation')
    try {
      // ... do work
      span.setAttribute('custom.attr', 'value')
    } catch (error) {
      span.recordException(error)
      throw error
    } finally {
      span.end()
    }
  }
}
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
| `ignoreRoutes`            | `string[]`                      | `[]`         | Routes to skip            |
| `includeNaviosAttributes` | `boolean`                       | `false`      | Add navios.\* attributes  |
| `sampling.ratio`          | `number`                        | `1.0`        | Sample ratio (0-1)        |

## License

MIT
