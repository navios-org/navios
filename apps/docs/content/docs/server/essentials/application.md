---
title: Application setup
---

# Application setup

An application is created from a root module and an adapter, then initialised and started.

```ts title="main.mts"
import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { NaviosFactory } from '@navios/server'

import { AppModule } from './app.module.mjs'

const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
  globalPrefix: '/api',
})
app.enableShutdownHooks()

const url = await app.listen({ port: 3000, host: '0.0.0.0' })
```

`NaviosFactory.create(rootModule, options)` only constructs the application. Nothing is resolved and no server exists until `init()` or `listen()`.

## Options

| Option                  | Type                                   | Default                              | Meaning                                                                                                    |
| ----------------------- | -------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `adapter`               | `AdapterDefinition`                    | required                             | The HTTP adapter: `defineFastifyEnvironment()` or `defineBunEnvironment()`                                 |
| `providers`             | `Provider[]`                           | none                                 | [`provide(...)`](/docs/server/essentials/services#providers-at-a-glance) entries that win over module providers |
| `plugins`               | `PluginInstance[]`                     | none                                 | [Plugins](/docs/server/guides/plugins). Same as calling `app.usePlugin()` for each                         |
| `container`             | `Container`                            | a new one                            | Use an existing DI container. `app.close()` disposes it                                                    |
| `logger`                | `LoggerService \| LogLevel[] \| false` | console logger                       | Where log output goes. See [Logging](/docs/server/essentials/config-and-logging#logging)                   |
| `globalPrefix`          | `string`                               | none                                 | Path prefix for every route                                                                                |
| `validateResponses`     | `'always' \| 'development' \| 'never'` | `'always'`                           | When handler results are validated. `'development'` validates unless `NODE_ENV` is `production`            |
| `exposeErrorDetails`    | `boolean`                              | `false`                              | Send the message of [unexpected errors](/docs/server/essentials/errors#unexpected-errors) to the client    |
| `clientErrorStacks`     | `'always' \| 'development' \| 'never'` | `'development'`                      | When 4xx errors capture a [stack](/docs/server/essentials/errors#stacks-of-client-errors). `'development'` captures unless `NODE_ENV` is `production` |
| `asyncContext`          | `boolean`                              | `false`                              | Make [`currentContext()`](/docs/server/essentials/request-context#reading-the-context-without-passing-it) work |
| `requestScopedServices` | `'allow' \| 'warn' \| 'forbid'`        | `'warn'`, or `'allow'` in production | What happens when a request-scoped service is used. See [Per-request state](/docs/server/guides/request-state) |
| `shutdownTimeout`       | `number` (ms)                          | `10000`                              | How long `close()` waits for in-flight requests                                                            |

Keep `validateResponses` at `'always'` unless a profile shows it matters: validation is what removes undeclared fields from responses.

Settings of the HTTP server itself, such as CORS, body limits and multipart, are options of the adapter factory, not of the application. See [Fastify](/docs/server/adapters/fastify) and [Bun](/docs/server/adapters/bun).

## Methods

| Method                              | When            | Purpose                                                                                             |
| ----------------------------------- | --------------- | --------------------------------------------------------------------------------------------------- |
| `app.usePlugin(plugin)`             | before `init()` | Registers a [plugin](/docs/server/guides/plugins)                                                   |
| `app.intercept(InterceptorClass)`   | before `init()` | Adds an [interceptor](/docs/server/essentials/guards-and-interceptors#attaching-interceptors) around every route |
| `app.mapError(ErrorClass, mapper)`  | any time        | [Maps an error class](/docs/server/essentials/errors#mapping-domain-errors) to a response           |
| `app.init()`                        | once            | Builds everything. Calling it again does nothing                                                    |
| `app.listen(options)`               |                 | Calls `init()` if needed, starts the server and resolves to its base URL                            |
| `app.inject(request)`               |                 | Calls `init()` if needed and handles a request in process. See [Testing](/docs/server/essentials/testing#injecting-requests) |
| `app.routes()`                      | after `init()`  | Every route as a `RouteInfo`                                                                        |
| `app.get(token)`                    |                 | Resolves a service from the container                                                               |
| `app.container`                     |                 | The DI container                                                                                    |
| `app.adapter`                       | after `init()`  | The adapter instance                                                                                |
| `app.getServer()`                   | after `init()`  | The adapter's native server                                                                         |
| `app.enableShutdownHooks(signals?)` |                 | Closes the application on process signals                                                           |
| `app.close(signal?)`                |                 | Shuts down. `app.dispose()` is an alias                                                             |

`usePlugin`, `intercept`, `mapError` and `enableShutdownHooks` return the application, so calls can be chained.

The options of `listen` belong to the adapter: `{ port, host }` on Fastify, `{ port, hostname }` on Bun.

## What `init()` does

In order:

1. Walks the module graph from the root module and registers module providers, so that everything resolved afterwards, the logger included, sees them.
2. Sets up the logger.
3. Enables the async context when `asyncContext` is on.
4. Resolves the four [error responders](/docs/server/essentials/errors#responders) and applies the mappers registered so far.
5. Creates the adapter.
6. Runs each plugin's set-up, in dependency order.
7. Walks the module graph again when plugins added modules, and registers the providers of those modules.
8. Instantiates each module and runs `onModuleInit`, imported modules first.
9. Instantiates controllers, guards and interceptors, and compiles one function per route. Broken [route rules](/docs/server/essentials/controllers#route-rules-checked-at-start-up) are reported here.
10. Registers the routes with the adapter and waits for it to be ready.
11. Runs plugin bootstrap hooks, then `onApplicationBootstrap` hooks.

An error in any step rejects the promise returned by `init()`, and therefore the one returned by `listen()`.

## Bootstrap and shutdown hooks

Any singleton service may implement these:

```ts
import { Injectable } from '@navios/server'

import type { OnApplicationBootstrap, OnApplicationShutdown } from '@navios/server'

@Injectable()
export class SearchIndex implements OnApplicationBootstrap, OnApplicationShutdown {
  async onApplicationBootstrap() {
    // routes are compiled, the server is not listening yet
    await this.warmUp()
  }

  async onApplicationShutdown(signal?: string) {
    // in-flight requests have finished
    await this.flush()
  }
}
```

| Hook                             | Runs                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------ |
| `onModuleInit()`                 | On [module classes](/docs/server/essentials/modules#onmoduleinit), before routes are compiled |
| `onApplicationBootstrap()`       | At the end of `init()`, in creation order                                                  |
| `onApplicationShutdown(signal?)` | During `close()`, in reverse creation order, after in-flight requests have finished        |

`signal` is the signal name when the shutdown came from `enableShutdownHooks`. The per-service hooks `onServiceInit` and `onServiceDestroy` belong to DI and are described in [Lifecycle](/docs/di/essentials/lifecycle).

:::warning
The hooks are called on the instances the container holds at that moment. A service that nothing has resolved by the end of `init()`, for example one that is only resolved lazily inside a handler, does not get `onApplicationBootstrap`. Inject such a service into a module, a controller or another eagerly created singleton if it needs the hook.
:::

## Shutdown

`app.close()` does the following:

1. Removes the signal handlers installed by `enableShutdownHooks`.
2. Asks the adapter to stop accepting connections and to wait for in-flight requests, for at most `shutdownTimeout` milliseconds.
3. Runs `onApplicationShutdown` hooks in reverse creation order.
4. Runs plugin shutdown hooks in reverse registration order.
5. Disposes the container, which runs `onServiceDestroy` in reverse creation order.

An error thrown by a shutdown hook is logged and does not stop the remaining hooks. Calling `close()` a second time does nothing. A closed application cannot be started again; create a new one.

To shut down when the process is asked to stop, opt in:

```ts
app.enableShutdownHooks() // SIGTERM and SIGINT
app.enableShutdownHooks(['SIGTERM'])
```

On the first of the given signals the application calls `close(signal)`. This is opt-in because a library should not install process signal handlers on its own. Navios does not call `process.exit()`; the process exits when nothing keeps the event loop alive.

The application also supports explicit resource management, which closes it when the variable goes out of scope:

```ts
await using app = await NaviosFactory.create(AppModule, {
  adapter: defineInMemoryEnvironment(),
})
```
