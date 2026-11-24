---
title: Plugins
---

# Plugins

A plugin packages setup that an application would otherwise do by hand: providers, interceptors, error mappers, extra routes and shutdown work. `@navios/schedule`, `@navios/openapi` and `@navios/otel` are plugins. There is one plugin shape.

## Defining a plugin

This plugin counts requests per route and status, and serves the counts at `/metrics`. The registry and the interceptor are ordinary services:

```ts title="metrics.plugin.mts"
import { builder } from '@navios/builder'
import {
  Controller,
  definePlugin,
  Endpoint,
  inject,
  Injectable,
  InjectionToken,
  Module,
} from '@navios/core'

import type { Interceptor, RequestContext, RouteResult } from '@navios/core'

export interface MetricsOptions {
  prefix: string
}

const MetricsOptionsToken = InjectionToken.create<MetricsOptions>('MetricsOptions')

@Injectable()
class MetricsRegistry {
  private readonly options = inject(MetricsOptionsToken)
  private readonly counts = new Map<string, number>()

  count(route: string, status: number | undefined) {
    const key = `${this.options.prefix}_requests{route="${route}",status="${status}"}`
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1)
  }

  render() {
    return [...this.counts].map(([key, value]) => `${key} ${value}\n`).join('')
  }
}

@Injectable()
class MetricsInterceptor implements Interceptor {
  private readonly registry = inject(MetricsRegistry)

  intercept(ctx: RequestContext, next: () => Promise<RouteResult>) {
    ctx.onFinish(() => this.registry.count(ctx.route.path, ctx.responseStatus))
    return next()
  }
}
```

The plugin wires them into an application:

```ts title="metrics.plugin.mts"
export const metricsPlugin = definePlugin({
  name: 'metrics',
  setup(api, options: MetricsOptions) {
    api.provide(MetricsOptionsToken, { value: options })
    api.intercept(MetricsInterceptor)
    api.addModule(MetricsModule) // defined below
    api.onShutdown(() => {
      // flush to wherever the counts go
    })
  },
})
```

`definePlugin` returns a function. Calling it with options gives a plugin instance:

```ts
const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
  plugins: [metricsPlugin({ prefix: 'api' })],
})

// or, before init()
app.usePlugin(metricsPlugin({ prefix: 'api' }))
```

A plugin whose `setup` declares no options is called without arguments: `app.usePlugin(csvPlugin())`. `usePlugin` throws once the application has been initialised.

## The plugin definition

| Field                 | Meaning                                                                                              |
| --------------------- | ---------------------------------------------------------------------------------------------------- |
| `name`                | Unique name. A plugin registered twice under one name is set up once; the first registration is used |
| `dependsOn`           | Names of plugins that must be set up before this one                                                 |
| `setup(api, options)` | Called once during `init()`. May be asynchronous                                                     |

Plugins are set up in dependency order, whatever order they were registered in. A dependency that is not registered, or a cycle between plugins, fails `init()` with a message naming the plugin.

## The plugin API

`setup` runs after the adapter has been created and before modules are loaded. Each call on `api` is recorded and applied at the right point of `init()`, so a plugin does not choose a stage.

| Call                               | Effect                                                                                                        |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `api.provide(token, impl)`         | Supplies or replaces a provider. `impl` is a class, `{ value }`, `{ class, scope? }` or `{ factory, scope? }` |
| `api.decorate(token, fn)`          | Wraps every instance of a service after it is built. `fn` receives the instance and returns the one to use    |
| `api.intercept(InterceptorClass)`  | Adds an interceptor around every route                                                                        |
| `api.mapError(ErrorClass, mapper)` | Maps an error class to a response, like `app.mapError`                                                        |
| `api.addModule(ModuleClass)`       | Adds a module, and so its routes, to the application                                                          |
| `api.encoder(kind, encoder)`       | Registers a [response encoder](#response-encoders) for a custom result kind                                   |
| `api.onBootstrap(hook)`            | Runs after routes are compiled and before the server listens. The hook receives `app.routes()`                |
| `api.onShutdown(hook)`             | Runs during `close()`, in reverse registration order. The hook receives the signal name, if any               |
| `api.container`                    | The DI container                                                                                              |
| `api.adapter`                      | The adapter instance                                                                                          |

Providers are described in [Providers](/docs/di/essentials/providers), interceptors in [Guards and interceptors](/docs/server/essentials/guards-and-interceptors) and error mappers in [Errors](/docs/server/essentials/errors).

## Contributing routes

A plugin adds routes by adding a module. The module, its controller and its endpoint declaration are written like any other; a plugin usually has its own `builder()` because it does not know the application's.

```ts title="metrics.plugin.mts"
const api = builder()

export const getMetrics = api.declareEndpoint({
  method: 'GET',
  url: '/metrics',
  response: 'text',
})

@Controller()
class MetricsController {
  private readonly registry = inject(MetricsRegistry)

  @Endpoint(getMetrics)
  metrics() {
    return this.registry.render()
  }
}

@Module({ controllers: [MetricsController] })
class MetricsModule {}
```

Routes added this way get the application's global prefix, pass through application-level interceptors and appear in `app.routes()`.

`api.onBootstrap` is where a plugin looks at the finished application. Its route list includes routes added by other plugins, because it is built after every `setup` has run:

```ts
api.onBootstrap(async (routes) => {
  const registry = await api.container.get(MetricsRegistry)
  for (const route of routes) {
    registry.count(route.path, 0) // start every route at a known series
  }
})
```

## Using the native server

`api.adapter` is typed as the adapter-neutral `HttpAdapter`, whose `server` is `unknown`. A plugin written for one adapter narrows it:

```ts
import { definePlugin } from '@navios/core'

import type { FastifyAdapter } from '@navios/adapter-fastify'

export const poweredBy = definePlugin({
  name: 'powered-by',
  setup(api) {
    const { server } = api.adapter as FastifyAdapter
    server.addHook('onSend', async (_request, reply) => {
      reply.header('x-powered-by', 'navios')
    })
  },
})
```

Registering a Fastify plugin works the same way: `await server.register(somePlugin)` in an `async setup`. On Bun the native server does not exist until `listen()`, so `api.adapter.server` throws during `setup`.

## Response encoders

An adapter knows how to write six kinds of result: `json`, `text`, `blob`, `stream`, `sse` and `empty`. An encoder converts a result of another kind into one of those, which lets a package add a response format without touching the adapters.

A handler produces a custom kind with `result(kind, body)`, usually behind a helper the package exports:

```ts title="csv.plugin.mts"
import { definePlugin, result } from '@navios/core'

export const csv = (rows: string[][]) => result('csv', rows)

export const csvPlugin = definePlugin({
  name: 'csv',
  setup(api) {
    api.encoder('csv', (value, ctx) => ({
      ...value,
      kind: 'text',
      headers: { ...value.headers, 'content-type': 'text/csv; charset=utf-8' },
      body: (value.body as string[][])
        .map((row) => row.join(ctx.query.separator === 'semicolon' ? ';' : ','))
        .join('\n'),
    }))
  },
})
```

The endpoint is declared with `response: 'text'`, `'stream'` or `'blob'`, and the handler returns the helper's value:

```ts
// exportUsers: GET /reports/users, response: 'text'
@Endpoint(exportUsers)
exportUsers() {
  return csv([
    ['id', 'name'],
    ['1', 'Ada'],
  ])
}
```

- An encoder runs inside the pipeline: after the handler's value has become a result, and before interceptors exit. It receives the request context, and an error it throws is mapped to a response like any other.
- `result()` also accepts `{ status, headers }` as a third argument.
- There is one encoder per kind; registering a second one for the same kind replaces the first.
- Encoders apply to route results only, not to the not-found response.

`@navios/adapter-xml` is built this way; see [XML responses](/docs/server/adapters/xml).
