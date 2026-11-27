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
| `adapter`               | `AdapterDefinition`                    | required                             | The HTTP adapter: `defineFastifyEnvironment()`, `defineBunEnvironment()` or `defineSrvxEnvironment()`      |
| `providers`             | `Provider[]`                           | none                                 | [`provide(...)`](/docs/server/essentials/services#providers-at-a-glance) entries that win over those of [plugins and modules](/docs/server/essentials/modules#providers) |
| `plugins`               | `PluginInstance[]`                     | none                                 | [Plugins](/docs/server/guides/plugins). Same as calling `app.usePlugin()` for each                         |
| `container`             | `Container`                            | a new one                            | Use an existing DI container. What it provides wins over everything else. It backs one open application at a time, and `app.close()` disposes it |
| `logger`                | `LoggerService \| LogLevel[] \| false` | console logger                       | Where log output goes. See [Logging](/docs/server/essentials/config-and-logging#logging)                   |
| `globalPrefix`          | `string`                               | none                                 | Path prefix for every route                                                                                |
| `guards`                | guard classes                          | none                                 | [Guards](/docs/server/essentials/guards-and-interceptors#attaching-guards) of every route, also of modules that plugins add. `app.guard()` adds more |
| `interceptors`          | interceptor classes                    | none                                 | [Interceptors](/docs/server/essentials/guards-and-interceptors#attaching-interceptors) around every route. `app.intercept()` adds more |
| `errorMappers`          | `[ErrorClass, mapper][]`               | none                                 | [Error mappers](/docs/server/essentials/errors#mapping-domain-errors) to start with. `app.mapError()` adds more |
| `validateResponses`     | `'always' \| 'never'`                  | `'always'`                           | Whether handler results are validated                                                                      |
| `exposeErrorDetails`    | `boolean`                              | `false`                              | Send the message of [unexpected errors](/docs/server/essentials/errors#unexpected-errors) to the client    |
| `clientErrorStacks`     | `'always' \| 'development' \| 'never'` | `'development'`                      | When 4xx errors capture a [stack](/docs/server/essentials/errors#stacks-of-client-errors). `'development'` captures unless `NODE_ENV` is `production` |
| `asyncContext`          | `boolean`                              | `false`                              | Make [`currentContext()`](/docs/server/essentials/request-context#reading-the-context-without-passing-it) work |
| `requestScopedServices` | `'allow' \| 'warn' \| 'forbid'`        | `'warn'`, or `'allow'` in production | What happens when a handler uses a service that is not a singleton with `ctx.use()` or `ctx.resolve()`. See [Per-request state](/docs/server/guides/request-state) |
| `transports`            | `TransportInstance[]`                  | none                                 | [Transports](/docs/server/guides/other-transports) beside HTTP, such as scheduled jobs                      |
| `shutdownTimeout`       | `number` (ms)                          | `10000`                              | How long `close()` waits for in-flight requests, and for each further step of the [shutdown](#shutdown)     |

Keep `validateResponses` at `'always'` unless a profile shows it matters: validation is what removes undeclared fields from responses. There is no setting that validates in development only, because it would send in production what development removes.

Settings of the HTTP server itself, such as CORS, body limits and multipart, are options of the adapter factory, not of the application. See [Fastify](/docs/server/adapters/fastify), [Bun](/docs/server/adapters/bun) and [srvx](/docs/server/adapters/srvx).

## Methods

| Method                              | When            | Purpose                                                                                             |
| ----------------------------------- | --------------- | --------------------------------------------------------------------------------------------------- |
| `app.usePlugin(plugin)`             | before `init()` | Registers a [plugin](/docs/server/guides/plugins)                                                   |
| `app.guard(GuardClass)`             | before `init()` | Adds a [guard](/docs/server/essentials/guards-and-interceptors#attaching-guards) of every route, after those of the `guards` option |
| `app.intercept(InterceptorClass)`   | before `init()` | Adds an [interceptor](/docs/server/essentials/guards-and-interceptors#attaching-interceptors) around every route |
| `app.mapError(ErrorClass, mapper)`  | any time        | [Maps an error class](/docs/server/essentials/errors#mapping-domain-errors) to a response           |
| `app.init()`                        | once            | Builds everything. Calling it again returns the same run                                            |
| `app.listen(options)`               |                 | Calls `init()` if needed, starts the server and the other transports, and resolves to its base URL  |
| `app.start()`                       |                 | Calls `init()` if needed and starts the other transports, without listening                         |
| `app.transport(factory)`            | after `init()`  | One of the application's [transports](/docs/server/guides/other-transports)                        |
| `app.findTransport(factory)`        |                 | The same, but `undefined` when the application has no such transport, or before `init()`            |
| `app.inject(request)`               |                 | Calls `init()` if needed and handles a request in process. See [Testing](/docs/server/essentials/testing#injecting-requests) |
| `app.routes()`                      | after `init()`  | Every route as a `RouteInfo`                                                                        |
| `app.get(token)`                    |                 | Resolves a service from the container                                                               |
| `app.container`                     |                 | The DI container                                                                                    |
| `app.adapter`                       | after `init()`  | The adapter instance                                                                                |
| `app.getServer()`                   | after `init()`  | The adapter's native server                                                                         |
| `app.enableShutdownHooks(signals?, options?)` | before `close()` | Closes the application on process signals                                                 |
| `app.close(signal?)`                |                 | Shuts down. `app.dispose()` is an alias                                                             |

`usePlugin`, `guard`, `intercept`, `mapError` and `enableShutdownHooks` return the application, so calls can be chained.

The options of `listen` belong to the adapter: `{ port, host }` on Fastify, `{ port, hostname }` on Bun and on srvx.

## What `init()` does

In order:

1. Walks the module graph from the root module and registers module providers, so that everything resolved afterwards, the logger included, sees them.
2. Enables the async context when `asyncContext` is on.
3. Resolves the four [error responders](/docs/server/essentials/errors#responders) and applies the mappers registered so far.
4. Creates the adapter.
5. Runs each plugin's set-up, in dependency order.
6. Walks the module graph again when plugins added modules, and registers the providers of those modules.
7. Sets up the logger, which a plugin or a module may provide, and writes what was logged before this point.
8. Instantiates each module and runs `onModuleInit`, imported modules first.
9. Instantiates controllers, guards and interceptors, and compiles one function per route. Broken [route rules](/docs/server/essentials/controllers#route-rules-checked-at-start-up) are reported here.
10. Registers the routes with the adapter and waits for it to be ready.
11. Runs plugin bootstrap hooks, then `onApplicationBootstrap` hooks.

An error in any step rejects the promise returned by `init()`, and therefore the one returned by `listen()`. Before it does, whatever was built is shut down, as by `close()` but without waiting for work in flight, so that nothing is left running. The same happens when a transport fails to start. The container is disposed then; an application that failed stays failed.

A hook that `init()`, `start()` or `close()` waits for cannot wait for that call in turn. `await app.start()` in `onModuleInit` rejects and says so; `app.start()` or `app.close()` there, without `await`, starts or closes the application once it is initialised. `await app.close()` in a shutdown hook resolves at once.

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
| `onApplicationBootstrap()`       | At the end of `init()`, dependencies before what uses them                                 |
| `onApplicationShutdown(signal?)` | During `close()`, dependents before what they use, after in-flight requests have finished  |

`signal` is the signal name when the shutdown came from `enableShutdownHooks`. The per-service hooks `onServiceInit` and `onServiceDestroy` belong to DI and are described in [Lifecycle](/docs/di/essentials/lifecycle).

:::warning
The hooks are called on the instances the container holds at that moment. A service that nothing has resolved by the end of `init()`, for example one that is only resolved lazily inside a handler, does not get `onApplicationBootstrap`. Inject such a service into a module, a controller or another eagerly created singleton if it needs the hook. Objects the container did not build, from `provide(token, { value })` or `addInstance()`, do not get the hooks at all, and neither does one that does not declare the hook itself or through its class, such as a proxy that answers for every name.
:::

## Shutdown

`app.close()` does the following:

1. Asks the adapter to stop accepting connections and to wait for in-flight requests, for at most `shutdownTimeout` milliseconds. Then everything that requests still hold is released: streams are closed, `onFinish` callbacks run and request scopes are disposed.
2. Runs `onApplicationShutdown` hooks, dependents before what they use.
3. Runs plugin shutdown hooks in reverse registration order.
4. Disposes the container, which runs `onServiceDestroy`, dependents first as well.

When the application is still initialising or starting, `close()` waits for that first. Every step gets `shutdownTimeout`, each hook on its own: what takes longer is logged with its name and left behind, so a hook or a database that hangs does not keep the process. An error in a step is logged and does not stop the remaining ones. Calling `close()` again returns the shutdown in flight. A closed application cannot be started again; create a new one.

To shut down when the process is asked to stop, opt in:

```ts
app.enableShutdownHooks() // SIGTERM and SIGINT
app.enableShutdownHooks(['SIGTERM'])
```

On the first of the given signals the application calls `close(signal)`. This is opt-in because a library should not install process signal handlers on its own. Call it before `init()` or `listen()`, so that a signal during the start-up is seen.

A signal that has a listener no longer ends the process. When every application the signal closes is closed, the process is therefore sent the signal again and ends the way it would have without Navios, with exit code 143 after `SIGTERM`, also when a timer or a socket is left. As process 1, which a container's main process is, it exits with that code by itself. It is not when something else in the process listens to the signal, or with `app.enableShutdownHooks(['SIGTERM'], { exit: false })`. A second signal ends the process at once. A signal during an `app.close()` that your code called waits for it.

The application also supports explicit resource management, which closes it when the variable goes out of scope:

```ts
await using app = await NaviosFactory.create(AppModule, {
  adapter: defineInMemoryEnvironment(),
})
```
