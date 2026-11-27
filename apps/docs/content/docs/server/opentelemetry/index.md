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

`app.usePlugin(otelPlugin(options))` before `init()` does the same. Registering the plugin twice with equal options sets it up once; with different options the application throws `registered twice with different options`.

## Configuration

| Option                    | Type                            | Default  | Description                                                                               |
| ------------------------- | ------------------------------- | -------- | ----------------------------------------------------------------------------------------- |
| `serviceName`             | `string`                        | required | Service name on every span.                                                               |
| `serviceVersion`          | `string`                        |          | Service version.                                                                          |
| `environment`             | `string`                        |          | Sets the `deployment.environment.name` resource attribute.                                |
| `exporter`                | `'otlp' \| 'console' \| 'none'` | required | Where spans go. See [Exporters](#exporters).                                              |
| `exporterOptions`         | `{ endpoint?, headers? }`       |          | OTLP endpoint and headers.                                                                |
| `spanProcessors`          | `SpanProcessor[]`               | `[]`     | Extra span processors, for an exporter of your own or for tests.                          |
| `autoInstrument.http`     | `boolean`                       | `true`   | Trace HTTP requests. `false` registers no interceptor.                                    |
| `autoInstrument.transports` | `boolean \| 'auto'`            | `'auto'` | Trace the handlers of [other transports](/docs/server/guides/other-transports): one span per run, named `<transport> <Class>.<handler>`. `'auto'` does so in an application without HTTP; in one that also serves HTTP, set `true`. [Scheduled jobs](/docs/server/guides/scheduled-jobs) do not run through interceptors and get no span from it; mark the class with `@Traced`. |
| `ignoreRoutes`            | `string[]`                      | `[]`     | Request paths without a server span. `*` matches any run of characters (`'/docs/*'`).     |
| `includeNaviosAttributes` | `boolean`                       | `false`  | Add `navios.controller`, `navios.handler` and `navios.module` to request spans.           |
| `sampling.ratio`          | `number`                        | `1.0`    | Share of the traces that start here to sample, from `0` to `1`. See [Sampling](#sampling). |
| `resourceAttributes`      | `Record<string, value>`         |          | Extra resource attributes.                                                                |
| `metrics.enabled`         | `boolean`                       | `false`  | Create a meter provider. See [Metrics](#metrics).                                         |
| `metrics.endpoint`        | `string`                        |          | URL of the OTLP metrics endpoint, when it is not next to the traces endpoint.             |
| `registerGlobally`        | `boolean`                       | `true`   | Register the provider, a context manager and the W3C propagators process-wide. See [Context propagation](#context-propagation). |

## Exporters

| `exporter`  | Spans go to                                                                 | Processing                         |
| ----------- | --------------------------------------------------------------------------- | ---------------------------------- |
| `'otlp'`    | An OTLP/HTTP endpoint, through `@opentelemetry/exporter-trace-otlp-http`.   | Batched.                           |
| `'console'` | Standard output. Useful in development.                                     | Written as each span ends.         |
| `'none'`    | Nowhere. Spans are still created, so `spanProcessors` and propagation work. | None.                              |

With `'otlp'`, `exporterOptions.endpoint` is the full URL of the traces endpoint, for example `http://localhost:4318/v1/traces`, and `exporterOptions.headers` is sent with every export, for example for authentication. When the exporter package is not installed, `init()` fails with a message naming it. An error of the exporter itself, such as one about its options, is thrown as it is.

To send spans somewhere this package has no exporter for, pass a span processor of your own. The processor classes come from `@opentelemetry/sdk-trace`:

```ts
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace'

otelPlugin({
  serviceName: 'users-api',
  exporter: 'none',
  spanProcessors: [new BatchSpanProcessor({ exporter: myExporter })],
})
```

## Sampling

`sampling.ratio` decides for a trace that starts in this application: a request without a `traceparent` header, or a span started outside any other. A span that has a parent follows the decision of the parent, as the default sampler of OpenTelemetry does (`ParentBasedSampler`):

- a request whose `traceparent` says the caller sampled the trace is sampled, whatever the ratio;
- a request whose `traceparent` says the caller did not is not sampled, even with a ratio of `1`;
- the spans of `@Traced` methods and the spans you start inside a request share the fate of the request span, so a trace is exported whole or not at all.

## HTTP request spans

The plugin registers one [interceptor](/docs/server/essentials/guards-and-interceptors), `OtelHttpInterceptor` from `@navios/otel/http`, around every route.

| Property   | Value                                                                                                                                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Name       | `<METHOD> <route path>`, with the route pattern, not the actual URL: `GET /users/$userId`.                                                                                                                         |
| Kind       | `SERVER`                                                                                                                                                                                                           |
| Attributes | `http.request.method`, `http.route`, `url.path` (the request path, without the query string), `http.request_id`, `user_agent.original` when the header is present, and the status as `http.response.status_code`. |
| Parent     | Taken from the incoming `traceparent` header when there is one, so the span continues the caller's trace.                                                                                                          |
| End        | When the response has finished: after the body was sent, a stream ended, or the client went away. The span of a streamed response covers the whole stream.                                                         |
| Status     | `ERROR` for a final response status of 500 and above, including one produced by an `app.mapError()` mapper; unset otherwise. A 4xx is the client's error, so the span is not marked as failed, and `OK` is never set. This is what the OpenTelemetry HTTP semantic conventions say for a server span. |
| Errors     | An error thrown by a guard, by validation or by the handler is recorded on the span as an exception event, whatever status it is answered with.                                                                    |

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

`context.with()` only has an effect when an OpenTelemetry context manager is registered. The context manager keeps the active span across `await`, timers and callbacks. The one the plugin registers is built on `AsyncLocalStorage` of `node:async_hooks`, which Node.js, Bun and Deno have, and Cloudflare Workers with the `nodejs_compat` flag. With `registerGlobally: true`, the default, the plugin registers the SDK's context manager together with the W3C trace-context and baggage propagators, so this works without further setup:

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
| `'otlp'`    | `metrics.endpoint`, or `exporterOptions.endpoint` with its trailing `/v1/traces` replaced by `/v1/metrics`, through `@opentelemetry/exporter-metrics-otlp-http`, every 60 seconds. |
| `'console'` | Standard output, every 10 seconds.                                                                                                  |
| `'none'`    | Nowhere.                                                                                                                            |

When the traces endpoint does not end in `/v1/traces`, there is nothing to derive the metrics endpoint from: set `metrics: { enabled: true, endpoint: 'https://collector.example/metrics' }`. Without it the metrics exporter uses its own default (`OTEL_EXPORTER_OTLP_METRICS_ENDPOINT`, `OTEL_EXPORTER_OTLP_ENDPOINT` or `http://localhost:4318/v1/metrics`), and a warning is logged during `init()`.

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

### Serverless: Cloudflare Workers and AWS Lambda

With `exporter: 'otlp'` spans are batched and sent on a timer, and besides that only when the application closes. On a platform that calls the application instead of running it, as in the [srvx recipes](/docs/server/adapters/srvx) for Cloudflare Workers and AWS Lambda, the application is initialised once and never closed, and the isolate or the function is frozen between invocations, so a batch that was not sent yet can be lost. Flush at the end of each invocation:

```ts title="lambda.mts"
import { OtelSetupService } from '@navios/otel'
import { handleLambdaEvent } from 'srvx/aws-lambda'

import type { AWSLambdaHandler } from 'srvx/aws-lambda'

import { createApp } from './app.mjs'

const ready = createApp().then(async (app) => {
  await app.init()
  return { fetch: app.getServer().fetch, otel: await app.container.get(OtelSetupService) }
})

export const handler: AWSLambdaHandler = async (event, context) => {
  const { fetch, otel } = await ready
  try {
    return await handleLambdaEvent(fetch, event, context)
  } finally {
    await otel.forceFlush()
  }
}
```

On Cloudflare Workers, do not hold the response back: hand the flush to `context.waitUntil(otel.forceFlush())` after the handler has returned the response, which keeps the Worker alive until the export is done.

`forceFlush()` exports spans and, with `metrics.enabled`, metrics. The span of a streamed response ends when the stream does, so a flush that runs before that does not carry it; it goes out with the next one.

The end-to-end tests of this package run on Fastify and Bun. The plugin is not tested on workerd or on Lambda: the exporters and the context manager need the Node.js APIs those platforms provide (`nodejs_compat` on Workers), and whether they work there is for you to verify.
