---
title: Setup
---

# Setup

`@navios/otel` adds OpenTelemetry tracing to a Navios application with one plugin, which is the same on every adapter. The plugin:

- starts the OpenTelemetry SDK and shuts it down with the application;
- creates a server span for every HTTP request that matches a route;
- creates child spans for the methods of services marked with `@Traced`;
- provides the tracer and the meter through dependency injection.

This page covers the plugin, its configuration and the request spans. [Tracing services and custom spans](/docs/server/opentelemetry/tracing) covers the rest.

## Install

```bash
npm install @navios/otel@next @opentelemetry/api

# For OTLP export (Jaeger, Tempo, an OpenTelemetry Collector, ...)
npm install @opentelemetry/exporter-trace-otlp-http
npm install @opentelemetry/exporter-metrics-otlp-http  # if metrics are enabled

# For a span processor or exporter of your own
npm install @opentelemetry/sdk-trace
```

`@opentelemetry/api` 1.10 is a peer dependency. The OpenTelemetry SDK 3 packages the plugin runs on are installed with it, and the exporters must be of the matching 0.3xx versions. The two OTLP exporters are optional and are loaded only when `exporter` is `'otlp'`.

## Add the plugin

```ts title="main.mts"
import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { NaviosFactory } from '@navios/server'
import { otelPlugin } from '@navios/otel'

import { AppModule } from './app.module.mjs'

const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
  plugins: [
    otelPlugin({
      serviceName: 'users-api',
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

| Option                    | Type                            | Default  | Description                                                                               |
| ------------------------- | ------------------------------- | -------- | ----------------------------------------------------------------------------------------- |
| `serviceName`             | `string`                        | required | Service name on every span.                                                               |
| `serviceVersion`          | `string`                        |          | Service version.                                                                          |
| `environment`             | `string`                        |          | Sets the `deployment.environment` resource attribute.                                     |
| `exporter`                | `'otlp' \| 'console' \| 'none'` | required | Where spans go. See [Exporters](#exporters).                                              |
| `exporterOptions`         | `{ endpoint?, headers? }`       |          | OTLP endpoint and headers.                                                                |
| `spanProcessors`          | `SpanProcessor[]`               | `[]`     | Extra span processors, for an exporter of your own or for tests.                          |
| `autoInstrument.http`     | `boolean`                       | `true`   | Trace HTTP requests. `false` registers no interceptor.                                    |
| `autoInstrument.transports` | `boolean \| 'auto'`            | `'auto'` | Trace the handlers of [other transports](/docs/server/guides/other-transports): one span per run, named `<transport> <Class>.<handler>`. `'auto'` does so in an application without HTTP; in one that also serves HTTP, set `true`. |
| `ignoreRoutes`            | `string[]`                      | `[]`     | Request paths without a server span. `*` matches any run of characters (`'/docs/*'`).     |
| `includeNaviosAttributes` | `boolean`                       | `false`  | Add `navios.controller`, `navios.handler` and `navios.module` to request spans.           |
| `sampling.ratio`          | `number`                        | `1.0`    | Share of traces to sample, from `0` to `1`.                                               |
| `resourceAttributes`      | `Record<string, value>`         |          | Extra resource attributes.                                                                |
| `metrics.enabled`         | `boolean`                       | `false`  | Create a meter provider. See [Metrics](#metrics).                                         |
| `registerGlobally`        | `boolean`                       | `true`   | Register the provider, a context manager and the W3C propagators process-wide. See [Context propagation](#context-propagation). |

## Exporters

| `exporter`  | Spans go to                                                                 | Processing                         |
| ----------- | --------------------------------------------------------------------------- | ---------------------------------- |
| `'otlp'`    | An OTLP/HTTP endpoint, through `@opentelemetry/exporter-trace-otlp-http`.   | Batched.                           |
| `'console'` | Standard output. Useful in development.                                     | Written as each span ends.         |
| `'none'`    | Nowhere. Spans are still created, so `spanProcessors` and propagation work. | None.                              |

With `'otlp'`, `exporterOptions.endpoint` is the full URL of the traces endpoint, for example `http://localhost:4318/v1/traces`, and `exporterOptions.headers` is sent with every export, for example for authentication. When the exporter package is not installed, `init()` fails with a message naming it.

To send spans somewhere this package has no exporter for, pass a span processor of your own. The processor classes come from `@opentelemetry/sdk-trace`:

```ts
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace'

otelPlugin({
  serviceName: 'users-api',
  exporter: 'none',
  spanProcessors: [new BatchSpanProcessor({ exporter: myExporter })],
})
```

## HTTP request spans

The plugin registers one [interceptor](/docs/server/essentials/guards-and-interceptors), `OtelHttpInterceptor` from `@navios/otel/http`, around every route.

| Property   | Value                                                                                                                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Name       | `HTTP <METHOD> <route path>`, with the route pattern, not the actual URL: `HTTP GET /users/$userId`.                                                                                                               |
| Kind       | `SERVER`                                                                                                                                                                                                           |
| Attributes | `http.method`, `http.route`, `http.url` (the request path, without the query string), `http.request_id`, `http.user_agent` when the header is present, and the status as `http.status_code` and `http.response.status_code`. |
| Parent     | Taken from the incoming `traceparent` header when there is one, so the span continues the caller's trace.                                                                                                          |
| End        | When the response has finished: after the body was sent, a stream ended, or the client went away. The span of a streamed response covers the whole stream.                                                         |
| Status     | `OK` below 400 and `ERROR` from 400 up, from the final status of the response, including one produced by an `app.mapError()` mapper.                                                                               |
| Errors     | An error thrown by a guard, by validation or by the handler is recorded on the span as an exception event.                                                                                                         |

Two limits follow from how interceptors work:

- A request that matches no route does not reach an interceptor and gets no span.
- Guards and the handler are not traced separately; the request span covers them together. Use `@Traced` on services for finer spans.

### The request span in a handler

The server span is stored on the request context under the `RequestSpan` key:

```ts
import { RequestSpan } from '@navios/otel'

// in a controller; getUser is the endpoint from the Quick start
@Endpoint(getUser)
async getUser({ urlParams }: HandlerParams<typeof getUser>, ctx: RequestContext) {
  ctx.find(RequestSpan)?.setAttribute('user.id', urlParams.userId)
  return this.users.findById(urlParams.userId) ?? reply(404, { message: 'User not found' })
}
```

Use `ctx.find()`, not `ctx.get()`: the key is not set for ignored routes or when `autoInstrument.http` is `false`.

## Context propagation

For each request the plugin starts the server span and runs the rest of the pipeline inside `context.with(...)` from `@opentelemetry/api`, with that span as the active span. Each traced service method does the same with its own span.

`context.with()` only has an effect when an OpenTelemetry context manager is registered. The context manager keeps the active span across `await`, timers and callbacks; in Node.js and Bun it is built on `AsyncLocalStorage`. With `registerGlobally: true`, the default, the plugin registers the SDK's context manager together with the W3C trace-context and baggage propagators, so this works without further setup:

```ts
import { trace } from '@opentelemetry/api'

async function anywhereBelowAHandler() {
  await somethingAsync()
  trace.getActiveSpan()?.addEvent('still the right span')
}
```

With `registerGlobally: false` the plugin still creates its own tracer provider and exports its spans, but registers nothing process-wide. Use it when the process already runs an OpenTelemetry SDK. Unless something else has registered a context manager and a propagator:

- `trace.getActiveSpan()` returns `undefined`;
- an incoming `traceparent` header is not read;
- the span of a `@Traced` method has no parent and starts a new trace.

The `asyncContext` option of the application is a separate `AsyncLocalStorage` that holds the request context, described in [Request context](/docs/server/essentials/request-context). This package does not need it. When it is on and no context manager is registered, the plugin uses it as a fallback: a `@Traced` method called during a request becomes a child of the request span, and `getCurrentSpan()` returns the request span. Spans nested deeper than that are still parented to the request span, not to each other.

## Metrics

The plugin records no metrics of its own. `metrics: { enabled: true }` creates a meter provider, and what you record through `MeterToken` is exported the same way as spans:

| `exporter`  | Metrics go to                                                                                                                       |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `'otlp'`    | `exporterOptions.endpoint` with `/traces` replaced by `/metrics`, through `@opentelemetry/exporter-metrics-otlp-http`, every 60 seconds. |
| `'console'` | Standard output, every 10 seconds.                                                                                                  |
| `'none'`    | Nowhere.                                                                                                                            |

```ts
import { inject, Injectable } from '@navios/server'
import { MeterToken } from '@navios/otel'

@Injectable()
export class SignupMetrics {
  private readonly signups = inject(MeterToken).createCounter('users.signups')

  record(plan: string) {
    this.signups.add(1, { plan })
  }
}
```

`MeterToken` is always provided. Without `metrics.enabled` it is a no-op meter, so code that records metrics does not need to check.

## Shutdown

`app.close()` flushes buffered spans and metrics and shuts the SDK down. Close the application when the process is asked to stop, otherwise the last batch of spans is lost:

```ts
app.enableShutdownHooks() // closes the application on SIGTERM and SIGINT
```

[Application setup](/docs/server/essentials/application) describes shutdown hooks and the order of `close()`.

To export without shutting down, for example at the end of a job, inject `OtelSetupService` and call `forceFlush()`.
