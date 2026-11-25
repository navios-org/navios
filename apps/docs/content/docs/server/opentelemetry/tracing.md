---
title: Tracing services and custom spans
---

# Tracing services and custom spans

The request span created by the [plugin](/docs/server/opentelemetry) covers a whole request. This page shows how to get finer spans: one per service method with `@Traced`, or spans you start yourself with the injected tracer.

## Tracing every method of a service

Mark a service with `@Traced` and each of its methods gets a child span on every call. No registration besides the plugin is needed.

```ts title="users.service.mts"
import { Injectable } from '@navios/server'
import { Traced } from '@navios/otel'

@Injectable()
@Traced({ name: 'users-service' })
export class UsersService {
  async findById(id: string) {
    // span "users-service.findById"
  }

  async create(input: { name: string; email: string }) {
    // span "users-service.create"
  }
}
```

## Tracing selected methods

`@Traceable` marks a class without tracing its methods. `@Traced` on a method then traces that method only.

```ts title="orders.service.mts"
import { Injectable } from '@navios/server'
import { Traceable, Traced } from '@navios/otel'

@Injectable()
@Traceable({ name: 'orders-service' })
export class OrdersService {
  @Traced({ name: 'process-order', attributes: { critical: true } })
  async processOrder(orderId: string) {
    // span "process-order" with critical=true
  }

  @Traced()
  async validateOrder(orderId: string) {
    // span "orders-service.validateOrder"
  }

  async getOrder(orderId: string) {
    // not traced
  }
}
```

A method-level `@Traced` needs `@Traceable` or `@Traced` on the class; without one the class is not instrumented. On a class traced as a whole, a method-level `@Traced` overrides the span name and adds attributes for that method.

## Decorator options

`@Traced` and `@Traceable` take the same options.

| Option       | Type                             | Meaning                                                                       |
| ------------ | -------------------------------- | ----------------------------------------------------------------------------- |
| `name`       | `string`                         | On a class, the prefix of its span names. On a method, the whole span name.   |
| `attributes` | `Record<string, AttributeValue>` | Attributes added to the spans. Method attributes are added to the class's.    |

## What a method span looks like

| Property   | Value                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| Name       | The method's own `name`, otherwise `<class name option or class name>.<method>`.                                          |
| Kind       | `INTERNAL`                                                                                                                |
| Attributes | `code.function`, `code.namespace` and the attributes from the decorators.                                                 |
| Parent     | The active span. Called from a handler, that is the request span; called from another traced method, that method's span.  |
| Errors     | An error thrown by the method, or a rejection of the promise it returns, is recorded on the span and rethrown.            |

Parenting depends on the context manager described in [Context propagation](/docs/server/opentelemetry#context-propagation).

## How instrumentation works

- Decorating a class adds it to a module-level set. The plugin reads the set once, during `init()`, and asks the container to instrument instances of each class as they are built, with [`container.decorate`](/docs/di/essentials/providers#decorating-instances). A class must therefore be imported before `init()`; importing the application's root module normally does that. A class first imported later is not traced.
- The instance is instrumented in place: each traced method is shadowed by a non-enumerable property on the instance. The object the container hands out is the service itself: `instanceof` and `#private` members work, and a traced method calling another one through `this` produces a nested span.
- `constructor`, `onServiceInit` and `onServiceDestroy` are never traced.
- It works for singleton, request-scoped and transient services.
- A class that is marked but not injectable is ignored.

To trace an object you create yourself, inject `TracedProxyFactory` and call `wrap(object, Class)`:

```ts
import { inject, Injectable } from '@navios/server'
import { Traced, TracedProxyFactory } from '@navios/otel'

@Traced({ name: 'report-builder' })
class ReportBuilder {
  async build() {
    // span "report-builder.build"
  }
}

@Injectable()
export class ReportsService {
  private readonly traced = inject(TracedProxyFactory)

  async monthly() {
    const builder = this.traced.wrap(new ReportBuilder(), ReportBuilder)
    return builder.build()
  }
}
```

`traceInstance(object, Class, tracer)` is the same operation as a function, for code that already holds a tracer.

Projects compiled with `experimentalDecorators` import `Traced` and `Traceable` from `@navios/otel/legacy-compat`; see [Legacy decorators](/docs/server/reference/legacy-decorators).

## Custom spans

Inject the application's tracer with `TracerToken` and use the OpenTelemetry API directly:

```ts title="reports.service.mts"
import { inject, Injectable } from '@navios/server'
import { TracerToken } from '@navios/otel'

@Injectable()
export class ReportsService {
  private readonly tracer = inject(TracerToken)

  async build() {
    return this.tracer.startActiveSpan('report.build', async (span) => {
      try {
        span.setAttribute('report.kind', 'monthly')
        return await this.render()
      } catch (error) {
        span.recordException(error as Error)
        throw error
      } finally {
        span.end()
      }
    })
  }

  private async render() {
    return 'report'
  }
}
```

What the plugin provides:

| Token                 | Value                                                                               |
| --------------------- | ----------------------------------------------------------------------------------- |
| `TracerToken`         | The application's `Tracer`.                                                         |
| `MeterToken`          | The application's `Meter`. See [Metrics](/docs/server/opentelemetry#metrics).       |
| `OtelConfigToken`     | The configuration with defaults applied.                                            |
| `OtelSetupService`    | The SDK owner: `forceFlush()`, `shutdown()`, `getTracer()`, `getMeter()`.           |
| `SpanFactoryService`  | Helpers that create spans with this package's names and attributes.                 |
| `TraceContextService` | `runWithSpan()`, `getCurrentSpan()`, `extractFromHeaders()`, `injectIntoHeaders()`. |
| `TracedProxyFactory`  | `wrap(object, Class)`, shown above.                                                 |

`getCurrentSpan()` is also exported as a function. It returns the active span, or `undefined` when there is none.

## Calling another service

Pass the trace on by injecting it into the outgoing headers. The called service then continues the same trace.

```ts title="billing.client.mts"
import { inject, Injectable } from '@navios/server'
import { TraceContextService } from '@navios/otel'

@Injectable()
export class BillingClient {
  private readonly traceContext = inject(TraceContextService)

  async charge(body: unknown) {
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    this.traceContext.injectIntoHeaders(headers) // adds traceparent
    return fetch('https://billing.internal/charge', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    })
  }
}
```

## Testing

Collect spans in memory with `spanProcessors` and call the application through the in-memory adapter from [Testing](/docs/server/essentials/testing):

```ts
import { NaviosFactory } from '@navios/server'
import { defineInMemoryEnvironment } from '@navios/server/testing'
import { otelPlugin } from '@navios/otel'
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace'
import { expect, it } from 'vitest'

import { AppModule } from '../src/app.module.mjs'

it('traces a request', async () => {
  const exporter = new InMemorySpanExporter()
  const app = await NaviosFactory.create(AppModule, {
    adapter: defineInMemoryEnvironment(),
    logger: false,
    plugins: [
      otelPlugin({
        serviceName: 'test',
        exporter: 'none',
        spanProcessors: [new SimpleSpanProcessor({ exporter })],
      }),
    ],
  })

  await app.inject({ method: 'GET', url: '/users/1' })
  const names = exporter.getFinishedSpans().map((span) => span.name)
  expect(names).toContain('HTTP GET /users/$userId')

  await app.close()
})
```

Close the application after each test. Closing takes back the process-wide registration, so the next application can register its own provider.
