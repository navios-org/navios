# Plugins

A plugin packages setup that an application would otherwise do by hand: providers, interceptors, error mappers, extra routes and shutdown work. There is one plugin shape.

## Defining a plugin

```ts
import { definePlugin } from '@navios/core'

export interface TracingOptions {
  serviceName: string
}

export const tracing = definePlugin({
  name: 'tracing',
  setup(api, options: TracingOptions) {
    api.provide(TracerToken, { value: createTracer(options.serviceName) })
    api.intercept(TracingInterceptor)
    api.onShutdown(() => flushSpans())
  },
})
```

`definePlugin` returns a function. Calling it with options gives a plugin instance for the application:

```ts
const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
  plugins: [tracing({ serviceName: 'api' })],
})

// or
app.usePlugin(tracing({ serviceName: 'api' }))
```

A plugin whose `setup` takes no options is called without arguments: `app.usePlugin(metrics())`.

`usePlugin` must be called before `init()`; afterwards it throws.

## The plugin definition

| Field                 | Meaning                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| `name`                | Unique name. A plugin registered twice under one name is set up once; the first registration is used. |
| `dependsOn`           | Names of plugins that must be set up before this one.                                                 |
| `setup(api, options)` | Called once during `init()`. May be asynchronous.                                                     |

Plugins are set up in dependency order regardless of the order they were registered in. A dependency that is not registered, or a cycle between plugins, fails `init()` with a message naming the plugin.

## The plugin API

`setup` runs after the adapter has been created and before modules are loaded. Each call on `api` is recorded and applied at the right point of `init()`, so a plugin does not choose a stage.

| Call                               | Effect                                                                                                           |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `api.provide(token, impl)`         | Replaces or supplies a provider. `impl` is a class, `{ value }`, `{ class, scope? }` or `{ factory, scope? }`.   |
| `api.decorate(token, fn)`          | Wraps every instance of a service after it is built. `fn` receives the instance and returns the instance to use. |
| `api.intercept(InterceptorClass)`  | Adds an interceptor around every route.                                                                          |
| `api.mapError(ErrorClass, mapper)` | Maps an error class to a response.                                                                               |
| `api.addModule(ModuleClass)`       | Adds a module, and so its routes, to the application.                                                            |
| `api.encoder(kind, encoder)`       | Registers a function that turns every `RouteResult` of the given custom `kind` into one an adapter can write.    |
| `api.onBootstrap(hook)`            | Runs after routes are compiled and before the server listens. The hook receives `app.routes()`.                  |
| `api.onShutdown(hook)`             | Runs during `close()`, in reverse registration order. The hook receives the signal name, if any.                 |
| `api.container`                    | The DI container.                                                                                                |
| `api.adapter`                      | The adapter instance.                                                                                            |

### Contributing routes

```ts
export const docs = definePlugin({
  name: 'docs',
  setup(api) {
    api.addModule(DocsModule)
    api.onBootstrap((routes) => {
      buildSpecification(routes)
    })
  },
})
```

The route list passed to `onBootstrap` includes routes added by other plugins, because it is built after every `setup` has run.

### Using the native server

`api.adapter` is typed as the adapter-neutral `HttpAdapter`, whose `server` is `unknown`. A plugin written for one adapter narrows it:

```ts
import type { FastifyAdapter } from '@navios/adapter-fastify'

export const helmet = definePlugin({
  name: 'helmet',
  async setup(api) {
    const { server } = api.adapter as FastifyAdapter
    await server.register(fastifyHelmet)
  },
})
```

On Bun the native server does not exist until `listen()`, so `api.adapter.server` throws during `setup`.

### Response encoders

An adapter writes the result kinds `json`, `text`, `blob`, `stream`, `sse` and `empty`. An encoder converts a result of another kind into one of those. A handler of an endpoint declared with `response: 'text'`, `'stream'` or `'blob'` produces a result of a custom kind with `result(kind, body)`, which a package usually wraps in its own helper:

```ts
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
        .map((row) => row.join(ctx.headers.get('x-separator') ?? ','))
        .join('\n'),
    }))
  },
})

// in a controller
@Endpoint(exportUsersEndpoint)
async exportUsers() {
  return csv(this.users.rows())
}
```

An encoder runs inside the pipeline: after the handler's value has become a result, and before interceptors exit. It receives the request context, so it can read request state, and an error it throws is mapped to a response like any other error. `result()` also accepts `{ status, headers }`.

Encoders are applied to route results only, not to the not-found response. There is one encoder per kind; registering a second one for the same kind replaces the first.
