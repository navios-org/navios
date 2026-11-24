# Application setup and lifecycle

## Creating an application

```ts
import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { NaviosFactory } from '@navios/core'

const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment({ cors: { origin: true } }),
  globalPrefix: '/api',
})

await app.listen({ port: 3000 })
```

`NaviosFactory.create(rootModule, options)` only constructs the application. Nothing is resolved and no server exists until `init()` or `listen()`.

Adapter-specific settings such as CORS and multipart are options of the adapter factory, not methods of the application. See the README of `@navios/adapter-fastify` or `@navios/adapter-bun`.

## Options

| Option                  | Type                                   | Default                              | Meaning                                                                                                                      |
| ----------------------- | -------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `adapter`               | `AdapterDefinition`                    | required                             | The HTTP adapter, for example `defineFastifyEnvironment()`.                                                                  |
| `providers`             | `Provider[]`                           | none                                 | `provide(token, impl)` entries that apply application-wide and win over module providers.                                    |
| `plugins`               | `PluginInstance[]`                     | none                                 | Same as calling `app.usePlugin()` for each.                                                                                  |
| `container`             | `Container`                            | a new one                            | Use an existing DI container. `app.close()` disposes it.                                                                     |
| `logger`                | `LoggerService \| LogLevel[] \| false` | console logger                       | `false` disables logging, an array selects the console logger's levels, an object is used as the logger.                     |
| `globalPrefix`          | `string`                               | none                                 | Prefix for every route.                                                                                                      |
| `validateResponses`     | `'always' \| 'development' \| 'never'` | `'always'`                           | When handler results are validated against the declared schema. `'development'` validates unless `NODE_ENV` is `production`. |
| `exposeErrorDetails`    | `boolean`                              | `false`                              | Send the message of unexpected errors to the client.                                                                         |
| `asyncContext`          | `boolean`                              | `false`                              | Keep the current `RequestContext` in an `AsyncLocalStorage` so that `currentContext()` works.                                |
| `requestScopedServices` | `'allow' \| 'warn' \| 'forbid'`        | `'warn'`, or `'allow'` in production | What happens the first time a token is requested with `ctx.use()` or `ctx.resolve()`.                                        |
| `shutdownTimeout`       | `number` (ms)                          | `10000`                              | How long `close()` waits for in-flight requests.                                                                             |

Keep `validateResponses` at `'always'` unless a profile shows it matters: validation is what strips undeclared fields from responses.

## Methods

| Method                              | When            | Purpose                                                                                 |
| ----------------------------------- | --------------- | --------------------------------------------------------------------------------------- |
| `app.usePlugin(plugin)`             | before `init()` | Registers a [plugin](./plugins.md).                                                     |
| `app.intercept(InterceptorClass)`   | before `init()` | Adds an interceptor around every route.                                                 |
| `app.mapError(ErrorClass, mapper)`  | any time        | Maps an error class to a response. See [Errors](./errors.md).                           |
| `app.init()`                        | once            | Builds everything. Calling it again does nothing.                                       |
| `app.listen(options)`               |                 | Calls `init()` if needed, starts the server and returns its base URL.                   |
| `app.inject(request)`               |                 | Calls `init()` if needed and handles a request in process. See [Testing](./testing.md). |
| `app.routes()`                      | after `init()`  | Every route as a `RouteInfo`.                                                           |
| `app.get(token)`                    |                 | Resolves a service from the container.                                                  |
| `app.container`                     |                 | The DI container.                                                                       |
| `app.adapter`                       | after `init()`  | The adapter instance.                                                                   |
| `app.getServer()`                   | after `init()`  | The adapter's native server.                                                            |
| `app.enableShutdownHooks(signals?)` |                 | Closes the application on process signals.                                              |
| `app.close(signal?)`                |                 | Shuts down. `app.dispose()` is an alias.                                                |

`usePlugin`, `intercept`, `mapError` and `enableShutdownHooks` return the application, so calls can be chained.

`listen` options belong to the adapter: `{ port, host }` on Fastify, `{ port, hostname }` on Bun.

## What `init()` does

In order:

1. Sets up the logger.
2. Enables the async context when `asyncContext` is on.
3. Resolves the four error responders and applies the mappers registered so far.
4. Creates the adapter.
5. Runs each plugin's `setup`, in dependency order.
6. Walks the module graph from the root module and the modules plugins added, and registers module providers.
7. Instantiates each module and runs `onModuleInit`, imported modules first.
8. Instantiates controllers, guards and interceptors, and compiles one function per route. Duplicate routes and scope mismatches are reported here.
9. Registers the routes with the adapter and waits for it to be ready.
10. Runs plugin `onBootstrap` hooks, then `onApplicationBootstrap` hooks.

An error in any step rejects the promise returned by `init()`.

## Bootstrap and shutdown hooks

Any singleton may implement these:

```ts
import { Injectable } from '@navios/core'

import type { OnApplicationBootstrap, OnApplicationShutdown } from '@navios/core'

@Injectable()
export class Database implements OnApplicationBootstrap, OnApplicationShutdown {
  async onApplicationBootstrap() {
    // routes are compiled, the server is not listening yet
    await this.warmUp()
  }

  async onApplicationShutdown(signal?: string) {
    // in-flight requests have finished
    await this.flush()
  }

  async onServiceDestroy() {
    // the container is being disposed
    await this.pool.end()
  }
}
```

- `onApplicationBootstrap()` runs at the end of `init()`, in creation order.
- `onApplicationShutdown(signal?)` runs during `close()`, in reverse creation order. `signal` is the signal name when the shutdown came from `enableShutdownHooks`.
- `onServiceInit` and `onServiceDestroy` are the DI lifecycle hooks of each service and are unchanged.

Limitation: the hooks are called on the instances the container holds at that moment. A service that nothing has resolved by the end of `init()`, for example one that is only resolved lazily inside a handler, does not get `onApplicationBootstrap`. Inject such a service into a module, a controller or another eagerly created singleton if it needs the hook.

## What `close()` does

1. Removes the signal handlers installed by `enableShutdownHooks`.
2. Asks the adapter to stop accepting connections and to wait for in-flight requests, for at most `shutdownTimeout` milliseconds.
3. Runs `onApplicationShutdown` hooks in reverse creation order.
4. Runs plugin `onShutdown` hooks in reverse registration order.
5. Disposes the container, which runs `onServiceDestroy` in reverse creation order.

An error thrown by a shutdown hook is logged and does not stop the remaining hooks. Calling `close()` a second time does nothing. After `close()`, the application cannot be started again.

The application supports explicit resource management:

```ts
await using app = await NaviosFactory.create(AppModule, { adapter: defineInMemoryEnvironment() })
```

## `enableShutdownHooks`

```ts
app.enableShutdownHooks() // SIGTERM and SIGINT
app.enableShutdownHooks(['SIGTERM'])
```

On the first of the given signals the application calls `close(signal)`. This is opt-in because a library should not install process signal handlers on its own. Navios does not call `process.exit()`; the process exits when nothing keeps the event loop alive.
