# @navios/otel

OpenTelemetry tracing for [Navios](https://navios.tech) applications. One plugin, the same on every adapter, starts the OpenTelemetry SDK, creates a server span for every HTTP request, adds child spans for the methods of services marked with `@Traced`, and provides the tracer and the meter through dependency injection.

**[Documentation](https://navios.tech/docs/server/opentelemetry/)** · [Tracing services and custom spans](https://navios.tech/docs/server/opentelemetry/tracing)

## Install

```bash
npm install @navios/otel@next @opentelemetry/api

# For OTLP export (Jaeger, Tempo, an OpenTelemetry Collector, ...)
npm install @opentelemetry/exporter-trace-otlp-http
```

The 2.0 alpha is published under the `next` tag. All `@navios` packages of a project must have the same alpha version, because an alpha may break between releases.

`@navios/core`, `@navios/di` and `@opentelemetry/api` are peer dependencies, and `@navios/server` is an optional one, needed for HTTP request spans; the OpenTelemetry SDK packages are installed with the plugin. The OTLP exporters are optional and loaded only when `exporter` is `'otlp'`. The example also uses `@navios/adapter-fastify`.

## Example

```ts
import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { otelPlugin, Traced } from '@navios/otel'
import { Injectable, Module, NaviosFactory } from '@navios/server'

@Injectable()
@Traced({ name: 'users-service' })
export class UsersService {
  async findById(id: string) {
    // span "users-service.findById", a child of the request span
    return { id, name: 'Ada' }
  }
}

@Module()
class AppModule {}

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

app.enableShutdownHooks() // close() flushes the last spans on SIGTERM and SIGINT
await app.listen({ port: 3000 })
```

Each request that matches a route gets one `SERVER` span named after the route pattern, such as `HTTP GET /users/$userId`. It continues the caller's trace when a `traceparent` header is present and ends when the response has finished. Guards, validation and the handler are covered by that one span; `@Traced` gives finer ones.

## What else it does

| Need                                          | How                                                         | Docs                                                                                                          |
| --------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Sampling, ignored routes, resource attributes | `sampling.ratio`, `ignoreRoutes`, `resourceAttributes`, ... | [Configuration](https://navios.tech/docs/server/opentelemetry/#configuration)                                 |
| OTLP, console or your own span processor      | `exporter`, `exporterOptions`, `spanProcessors`             | [Exporters](https://navios.tech/docs/server/opentelemetry/#exporters)                                         |
| Know what a request span contains             | name, attributes, status, recorded errors                   | [HTTP request spans](https://navios.tech/docs/server/opentelemetry/#http-request-spans)                       |
| Add attributes to the request span            | `ctx.find(RequestSpan)`                                     | [The request span in a handler](https://navios.tech/docs/server/opentelemetry/#the-request-span-in-a-handler) |
| Run next to an SDK the process already has    | `registerGlobally: false`                                   | [Context propagation](https://navios.tech/docs/server/opentelemetry/#context-propagation)                     |
| Record metrics                                | `metrics: { enabled: true }`, `inject(MeterToken)`          | [Metrics](https://navios.tech/docs/server/opentelemetry/#metrics)                                             |
| Trace only some methods of a service          | `@Traceable` on the class, `@Traced` on methods             | [Tracing selected methods](https://navios.tech/docs/server/opentelemetry/tracing#tracing-selected-methods)    |
| Trace an object you create yourself           | `TracedProxyFactory`, `traceInstance()`                     | [How instrumentation works](https://navios.tech/docs/server/opentelemetry/tracing#how-instrumentation-works)  |
| Start spans by hand                           | `inject(TracerToken)`                                       | [Custom spans](https://navios.tech/docs/server/opentelemetry/tracing#custom-spans)                            |
| Pass the trace to another service             | `injectTraceContext(headers)`                               | [Calling another service](https://navios.tech/docs/server/opentelemetry/tracing#calling-another-service)      |
| Assert on spans in tests                      | `exporter: 'none'` with an in-memory span processor         | [Testing](https://navios.tech/docs/server/opentelemetry/tracing#testing)                                      |

A traced class must be imported before `app.init()`, which importing the root module normally does. Projects that keep `experimentalDecorators` on import `Traced` and `Traceable` from `@navios/otel/legacy-compat`; see [Legacy decorators](https://navios.tech/docs/server/reference/legacy-decorators).

[examples/otel-fastify](../../examples/otel-fastify) and [examples/otel-bun](../../examples/otel-bun) are runnable applications.

## Upgrading from 1.x

`otelPlugin` from this package replaces `defineOtelPlugin` from `@navios/otel-fastify` and `@navios/otel-bun`, which are removed in 2.0, and it traces `@Traced` services without a second plugin. See [Migrating to 2.0](https://navios.tech/docs/server/reference/migrating-to-2#naviosotel), or [CHANGELOG.md](./CHANGELOG.md) for the full list.

## License

MIT
