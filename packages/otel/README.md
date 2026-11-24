# @navios/otel

OpenTelemetry tracing for Navios applications. One plugin, the same on every adapter (Fastify, Bun, the in-memory test adapter):

- starts the OpenTelemetry SDK and shuts it down with the application;
- creates a server span for every HTTP request;
- creates child spans for the methods of services marked with `@Traced`;
- provides the tracer and the meter through dependency injection.

## Installation

```bash
yarn add @navios/otel @opentelemetry/api

# For OTLP export (Jaeger, Tempo, an OpenTelemetry Collector, ...)
yarn add @opentelemetry/exporter-trace-otlp-http
yarn add @opentelemetry/exporter-metrics-otlp-http  # if metrics are enabled
```

`@opentelemetry/api` is a peer dependency. The OpenTelemetry SDK packages the plugin runs on are regular dependencies and are installed with it. The two OTLP exporters are optional peer dependencies, loaded only when `exporter` is `'otlp'`.

## Quick start

```typescript
import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { NaviosFactory } from '@navios/core'
import { otelPlugin } from '@navios/otel'

const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(), // or defineBunEnvironment()
  plugins: [
    otelPlugin({
      serviceName: 'my-api',
      exporter: 'otlp',
      exporterOptions: { endpoint: 'http://localhost:4318/v1/traces' },
      ignoreRoutes: ['/health'],
    }),
  ],
})

await app.listen({ port: 3000 })
```

`app.usePlugin(otelPlugin(options))` before `init()` does the same. Registering the plugin twice sets it up once.

## Configuration

| Option                    | Type                            | Default      | Description                                                                               |
| ------------------------- | ------------------------------- | ------------ | ----------------------------------------------------------------------------------------- |
| `serviceName`             | `string`                        | **required** | Service name on every span.                                                               |
| `serviceVersion`          | `string`                        |              | Service version.                                                                          |
| `environment`             | `string`                        |              | Sets the `deployment.environment` resource attribute.                                     |
| `exporter`                | `'otlp' \| 'console' \| 'none'` | **required** | Where spans go. `'none'` creates spans without exporting them.                            |
| `exporterOptions`         | `{ endpoint?, headers? }`       |              | OTLP endpoint and headers.                                                                |
| `spanProcessors`          | `SpanProcessor[]`               | `[]`         | Extra span processors, for an exporter of your own or for tests.                          |
| `autoInstrument.http`     | `boolean`                       | `true`       | Trace HTTP requests. `false` registers no interceptor.                                    |
| `ignoreRoutes`            | `string[]`                      | `[]`         | Request paths without a server span. `*` matches any run of characters (`'/docs/*'`).     |
| `includeNaviosAttributes` | `boolean`                       | `false`      | Add `navios.controller`, `navios.handler` and `navios.module` to request spans.           |
| `sampling.ratio`          | `number`                        | `1.0`        | Share of traces to sample, from `0` to `1`.                                               |
| `resourceAttributes`      | `Record<string, value>`         |              | Extra resource attributes.                                                                |
| `metrics.enabled`         | `boolean`                       | `false`      | Create a meter provider. `MeterToken` is a no-op meter otherwise.                         |
| `registerGlobally`        | `boolean`                       | `true`       | Register the provider, a context manager and the W3C propagators process-wide. See below. |

The 1.x options `autoInstrument.handlers`, `autoInstrument.guards`, `propagateContext`, `metrics.requestDuration` and `metrics.errorCount` are removed. A request span covers guards, validation and the handler as one unit; use `@Traced` for finer spans.

## HTTP request spans

The plugin registers one interceptor, `OtelHttpInterceptor`, around every route.

- **Name**: `HTTP <METHOD> <route path>`, with the route pattern rather than the actual URL: `HTTP GET /users/$id`.
- **Kind**: `SERVER`.
- **Attributes**: `http.method`, `http.route`, `http.url` (the request path, without the query string), `http.request_id`, `http.user_agent` when the header is present, and the response status as both `http.status_code` and `http.response.status_code`.
- **Parent**: taken from the incoming `traceparent` header when there is one, so the span continues the caller's trace.
- **End**: when the response has finished: after the body was sent, a stream ended, or the client went away. The span of a streamed response covers the whole stream.
- **Status**: the final status of the response, `OK` below 400 and `ERROR` from 400 up. For an error this is the status it was mapped to, including by a mapper registered with `app.mapError()`.
- **Errors**: an error thrown by a guard, by validation or by the handler is recorded on the span as an exception event.

Two limits follow from how interceptors work:

- A request that matches no route does not reach an interceptor and gets no span.
- Guards and the handler are not traced separately; the request span covers them together.

### The request span in a handler

The server span is stored on the request context under the `RequestSpan` key:

```typescript
import { RequestSpan } from '@navios/otel'

getUser = handler(getUser, async ({ urlParams }, ctx) => {
  ctx.find(RequestSpan)?.setAttribute('user.id', urlParams.id)
  return this.users.find(urlParams.id)
})
```

Use `ctx.find()`: the key is not set for ignored routes or when `autoInstrument.http` is `false`.

## Context propagation

Two different things carry "the current span", and it helps to know which does what.

**What the plugin does.** For each request it starts the server span, stores it on the request context (`RequestSpan`) and runs the rest of the pipeline inside `context.with(...)` from `@opentelemetry/api`, with that span as the active span. Each traced service method does the same with its own span.

**What a context manager does.** `context.with()` only has an effect when an OpenTelemetry _context manager_ is registered. The context manager is what keeps the active span across `await`, timers and callbacks; in Node.js and Bun it is built on `AsyncLocalStorage`. Providing one is the SDK's job. By default the plugin starts the SDK with `registerGlobally: true`, which registers the SDK's context manager together with the W3C trace-context and baggage propagators, so this works without further setup:

```typescript
import { trace } from '@opentelemetry/api'

async function anywhereBelowAHandler() {
  await somethingAsync()
  trace.getActiveSpan()?.addEvent('still the right span')
}
```

With `registerGlobally: false` the plugin registers nothing process-wide. Unless something else has registered a context manager and a propagator:

- `trace.getActiveSpan()` returns `undefined`;
- an incoming `traceparent` header is not read;
- the span of a `@Traced` method has no parent and starts a new trace.

The `asyncContext: true` option of `@navios/core` is a separate, opt-in `AsyncLocalStorage` that holds the request context. It is not required by this package. When it is on and no context manager is registered, the plugin uses it as a fallback: a `@Traced` method called during a request becomes a child of the request span, and `getCurrentSpan()` returns the request span. Spans nested deeper than that are still parented to the request span, not to each other.

## Tracing services

Mark a service and its methods get a child span on every call. No registration besides the plugin is needed.

### `@Traced` on a class: every method

```typescript
import { Injectable } from '@navios/di'
import { Traced } from '@navios/otel'

@Injectable()
@Traced({ name: 'user-service' })
class UserService {
  async getUser(id: string) {
    // span "user-service.getUser"
  }

  async updateUser(id: string, data: UserData) {
    // span "user-service.updateUser"
  }
}
```

### `@Traceable` on a class, `@Traced` on methods: selected methods

```typescript
import { Injectable } from '@navios/di'
import { Traceable, Traced } from '@navios/otel'

@Injectable()
@Traceable({ name: 'order-service' })
class OrderService {
  @Traced({ name: 'process-order', attributes: { critical: true } })
  async processOrder(orderId: string) {
    // span "process-order" with critical=true
  }

  @Traced()
  async validateOrder(orderId: string) {
    // span "order-service.validateOrder"
  }

  async getOrder(orderId: string) {
    // not traced
  }
}
```

A method-level `@Traced` needs `@Traceable` or `@Traced` on the class. A method-level `@Traced` on a class traced as a whole overrides the span name and adds attributes for that method.

### What a method span looks like

- Name: the method's own `name`, otherwise `<class name option or class name>.<method>`.
- Kind `INTERNAL`, with `code.function`, `code.namespace` and the attributes from the decorators.
- Parent: the active span. Called from a handler, that is the request span; called from another traced method, that method's span.
- An error thrown by the method, or a rejection of the promise it returns, is recorded on the span and rethrown.

### How it works, and what follows from it

- Decorating a class adds it to a module-level set. The plugin reads the set once, during `init()`, and asks the container to instrument instances of each class as they are built (`container.decorate`). A class must therefore be imported before `init()`; importing the application's root module normally does that. A class first imported later is not traced.
- The instance is instrumented in place: each traced method is shadowed by a non-enumerable property on the instance. The object the container hands out is the service itself, `instanceof` and `#private` members work, and a traced method calling another one through `this` produces a nested span.
- `constructor`, `onServiceInit` and `onServiceDestroy` are never traced.
- It works for singleton, request-scoped and transient services.
- A class that is marked but not injectable is ignored. To trace an object you create yourself, use `traceInstance(object, Class, tracer)` or inject `TracedProxyFactory` and call `wrap(object, Class)`.

### Decorator options

```typescript
interface TracedOptions {
  // Span name. Defaults to "className.methodName".
  name?: string
  // Attributes added to the spans.
  attributes?: Record<string, AttributeValue>
}
```

Projects that use TypeScript's `experimentalDecorators` import the decorators from `@navios/otel/legacy-compat`.

## Custom spans

```typescript
import { inject, Injectable } from '@navios/di'
import { TracerToken } from '@navios/otel'

@Injectable()
class ReportService {
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
}
```

What the plugin provides:

| Token                 | Value                                                                               |
| --------------------- | ----------------------------------------------------------------------------------- |
| `TracerToken`         | The application's `Tracer`.                                                         |
| `MeterToken`          | The application's `Meter`; a no-op meter unless `metrics.enabled` is set.           |
| `OtelConfigToken`     | The configuration with defaults applied.                                            |
| `OtelSetupService`    | The SDK owner: `forceFlush()`, `shutdown()`, `getTracer()`, `getMeter()`.           |
| `SpanFactoryService`  | Helpers that create spans with this package's names and attributes.                 |
| `TraceContextService` | `runWithSpan()`, `getCurrentSpan()`, `extractFromHeaders()`, `injectIntoHeaders()`. |

### Calling another service

Pass the trace on by injecting it into the outgoing headers:

```typescript
import { inject, Injectable } from '@navios/di'
import { TraceContextService } from '@navios/otel'

@Injectable()
class BillingClient {
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

## Shutdown

`app.close()` flushes buffered spans and metrics and shuts the SDK down. Call it when the process is asked to stop, otherwise the last batch of spans is lost:

```typescript
process.once('SIGTERM', () => {
  void app.close().finally(() => process.exit(0))
})
```

To export without shutting down, for example at the end of a job, inject `OtelSetupService` and call `forceFlush()`.

## Testing

Collect spans in memory with `spanProcessors` and call the application through the in-memory adapter:

```typescript
import { NaviosFactory } from '@navios/core'
import { defineInMemoryEnvironment } from '@navios/core/testing'
import { otelPlugin } from '@navios/otel'
import { InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-node'

const exporter = new InMemorySpanExporter()
const app = await NaviosFactory.create(AppModule, {
  adapter: defineInMemoryEnvironment(),
  plugins: [
    otelPlugin({
      serviceName: 'test',
      exporter: 'none',
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    }),
  ],
})

await app.inject({ method: 'GET', url: '/users/1' })
expect(exporter.getFinishedSpans().map((span) => span.name)).toContain('HTTP GET /users/$id')

await app.close()
```

Close the application after each test: closing takes back the process-wide registration, so the next application can register its own provider.

## Packages

- `@navios/otel`: everything (this package).
- `@navios/otel-fastify`, `@navios/otel-bun`: deprecated re-exports of this package's plugin, kept so that 1.x imports resolve.

## Migrating from 1.x

| 1.x                                                                                                | 2.0                                                         |
| -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `defineOtelPlugin(options)` from `@navios/otel-fastify` / `-bun`                                   | `otelPlugin(options)` from `@navios/otel`                   |
| `app.usePlugin(defineOtelTracingPlugin({}))`                                                       | not needed; `otelPlugin` traces `@Traced` services          |
| `request.otelSpan` (Fastify)                                                                       | `ctx.find(RequestSpan)`                                     |
| `autoInstrument.handlers` / `guards`, `propagateContext`, `metrics.requestDuration` / `errorCount` | removed                                                     |
| `getSpanContextStore()`                                                                            | removed; the active span lives in the OpenTelemetry context |
| `createTracedWrapperFactory()`                                                                     | removed; use `traceInstance()`                              |
| `container.get(OtelSetupService)` then `initialize()` / `shutdown()`                               | done by the plugin                                          |

## License

MIT
