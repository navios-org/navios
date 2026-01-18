# @navios/otel

OpenTelemetry integration for the Navios framework. This package provides distributed tracing and metrics collection capabilities.

## Installation

```bash
# Core package
yarn add @navios/otel @opentelemetry/api

# For OTLP export (Jaeger, Tempo, etc.)
yarn add @opentelemetry/exporter-trace-otlp-http
yarn add @opentelemetry/exporter-metrics-otlp-http  # If using metrics
```

## Quick Start

### With Fastify Adapter

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
    exporter: 'otlp',
    exporterOptions: {
      endpoint: 'http://localhost:4318/v1/traces',
    },
    autoInstrument: {
      http: true,
      handlers: true,
    },
  }),
)

await app.listen({ port: 3000 })
```

### With Bun Adapter

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
    exporter: 'console', // For development
    autoInstrument: {
      http: true,
    },
  }),
)

await app.listen({ port: 3000 })
```

## Configuration

```typescript
interface OtelConfig {
  // Required
  serviceName: string

  // Exporter type
  exporter: 'otlp' | 'console' | 'none'
  exporterOptions?: {
    endpoint?: string
    headers?: Record<string, string>
  }

  // Auto-instrumentation
  autoInstrument: {
    http?: boolean // Trace incoming HTTP requests (default: true)
    handlers?: boolean // Trace controller handlers (default: true)
    guards?: boolean // Trace guard execution (default: false)
  }

  // Metrics (optional)
  metrics?: {
    enabled: boolean
    requestDuration?: boolean // default: true
    errorCount?: boolean // default: true
  }

  // Include navios.* span attributes
  includeNaviosAttributes?: boolean // default: false

  // Sampling
  sampling?: {
    ratio?: number // 0.0 to 1.0, default: 1.0
  }
}
```

## Automatic Service Tracing

Use the `@Traced` and `@Traceable` decorators combined with the `defineOtelTracingPlugin` to automatically trace your services.

### Setup

```typescript
import { NaviosFactory } from '@navios/core'
import { defineOtelTracingPlugin } from '@navios/otel'

const app = await NaviosFactory.create(AppModule)

// Register the tracing plugin to wrap decorated services
app.usePlugin(defineOtelTracingPlugin({}))

await app.listen({ port: 3000 })
```

### @Traced Decorator

Use `@Traced` on a class to trace all methods automatically:

```typescript
import { Injectable } from '@navios/di'
import { Traced } from '@navios/otel'

// Class-level: traces all methods
@Injectable()
@Traced({ name: 'user-service' })
class UserService {
  async getUser(id: string) {
    // Creates span: "user-service.getUser"
  }

  async updateUser(id: string, data: UserData) {
    // Creates span: "user-service.updateUser"
  }
}
```

### @Traceable Decorator

Use `@Traceable` when you only want to trace specific methods:

```typescript
import { Injectable } from '@navios/di'
import { Traceable, Traced } from '@navios/otel'

@Injectable()
@Traceable({ name: 'order-service' })
class OrderService {
  @Traced({ name: 'process-order', attributes: { critical: true } })
  async processOrder(orderId: string) {
    // Traced as "process-order" with critical=true attribute
  }

  async getOrder(orderId: string) {
    // NOT traced - no @Traced decorator on this method
  }

  @Traced() // Uses default naming: "order-service.validateOrder"
  async validateOrder(orderId: string) {
    // Traced with default span name
  }
}
```

### Combined Usage

You can combine class-level `@Traced` with method-level overrides:

```typescript
@Injectable()
@Traced({ name: 'payment-service' })
class PaymentService {
  async createPayment(data: PaymentData) {
    // Creates span: "payment-service.createPayment"
  }

  @Traced({ name: 'heavy-validation', attributes: { critical: true } })
  async validatePayment(paymentId: string) {
    // Overridden: traced as "heavy-validation" with critical=true
  }
}
```

### Decorator Options

```typescript
interface TracedOptions {
  // Custom span name (defaults to "className.methodName")
  name?: string

  // Additional span attributes
  attributes?: Record<string, AttributeValue>
}
```

## Custom Spans

Create custom spans using the injected tracer:

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
      span.setAttribute('custom.attribute', 'value')
    } catch (error) {
      span.recordException(error)
      throw error
    } finally {
      span.end()
    }
  }
}
```

## Packages

- `@navios/otel` - Core OpenTelemetry abstractions (this package)
- `@navios/otel-fastify` - Fastify adapter integration
- `@navios/otel-bun` - Bun adapter integration

## License

MIT
