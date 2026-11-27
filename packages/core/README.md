# @navios/core

What a Navios application is made of, whatever reaches it: dependency injection, modules, plugins, lifecycle hooks, configuration and logging, and the contracts a transport builds on. It has no HTTP in it.

- An HTTP server is [`@navios/server`](https://www.npmjs.com/package/@navios/server), which is built on this package and re-exports it. Install that one for a web application.
- This package alone runs a worker: a process that consumes a queue, runs scheduled jobs, or both.

**[Documentation](https://navios.tech/docs/server/guides/other-transports)**

## Install

```bash
npm install @navios/core@next
```

The 2.0 alpha is published under the `next` tag. All `@navios` packages of a project must have the same alpha version, because an alpha may break between releases.

Navios uses standard (TC39) decorators, so leave `experimentalDecorators` off. A project that has to keep it on imports from `@navios/core/legacy-compat`.

## Example

A worker that runs scheduled jobs, with [`@navios/schedule`](https://www.npmjs.com/package/@navios/schedule):

```ts
import { createApplication, inject, Injectable, Logger, Module } from '@navios/core'
import { Cron, Schedulable, Schedule, scheduleTransport } from '@navios/schedule'

@Injectable()
class SessionsService {
  async deleteExpired() {
    return 0
  }
}

@Schedulable()
class MaintenanceJobs {
  private readonly sessions = inject(SessionsService)
  private readonly logger = inject(Logger, { context: 'MaintenanceJobs' })

  @Cron(Schedule.EveryHour)
  async purgeSessions() {
    this.logger.log(`Removed ${await this.sessions.deleteExpired()} expired sessions`)
  }
}

@Module({ jobs: [MaintenanceJobs] })
class WorkerModule {}

const app = createApplication(WorkerModule, {
  transports: [scheduleTransport()],
})
app.enableShutdownHooks()

await app.start()
```

## Transports

An application hosts zero or more transports: the ways work reaches it. They share its modules, its container, its plugins and its lifecycle.

```ts
const app = createApplication(AppModule, {
  transports: [messageTransport()], // from @navios/microservice
})
```

`@navios/microservice` is not published yet.

| Transport | Package                                                              | `@Module` option     |
| --------- | -------------------------------------------------------------------- | -------------------- |
| HTTP      | [`@navios/server`](https://www.npmjs.com/package/@navios/server)     | `controllers`        |
| Messages  | `@navios/microservice` (not published yet)                           | `messageControllers` |
| Cron jobs | [`@navios/schedule`](https://www.npmjs.com/package/@navios/schedule) | `jobs`               |

A module lists what it has for each transport, and an application ignores the options of transports it does not have, so one module can serve several.

## What it contains

| Need                                      | How                                                                          |
| ----------------------------------------- | ---------------------------------------------------------------------------- |
| Services and their scopes                 | `@Injectable()`, `inject()`, `provide()` and the rest of `@navios/di`        |
| Grouping, shared guards and attributes    | `@Module()`                                                                  |
| The application and its lifecycle         | `createApplication`, `init()`, `start()`, `close()`                          |
| Hooks                                     | `onModuleInit`, `onApplicationBootstrap`, `onApplicationShutdown`            |
| Reusable setup                            | `definePlugin`                                                               |
| Guards and interceptors for any transport | `Guard`, `Interceptor`, `ExecutionContext`, `@UseGuards`, `@UseInterceptors` |
| Per-execution data                        | `createContextKey`, `currentContext()`                                       |
| Metadata on modules and handlers          | `AttributeFactory`                                                           |
| Typed configuration, logging              | `provideConfig`, `Logger`                                                    |

## Entry points

| Import                       | Contents                                                                                        |
| ---------------------------- | ----------------------------------------------------------------------------------------------- |
| `@navios/core`               | The above, with what applications use of `@navios/di`.                                          |
| `@navios/core/transport`     | For transport authors: the contract, the module graph, handler chains, `BasicExecutionContext`. |
| `@navios/core/testing`       | `fakeTransport`, a transport for tests of plugins and of the application lifecycle.             |
| `@navios/core/legacy-compat` | Decorators for `experimentalDecorators` projects.                                               |

## One copy

Every package of an application has to resolve the same `@navios/core`. `@navios/server`, the other transports and the plugins that work on any transport list it as a peer dependency, so an application installs it once, beside them. HTTP adapters peer on `@navios/server` only and reach this package through it. If two copies are loaded, a warning names both locations. Two copies that a bundler put into one file are not noticed.

## Upgrading from 1.x

In 1.x this package was the HTTP framework. That is now `@navios/server`: replace the import specifier `@navios/core` with `@navios/server`, and see [Migrating to 2.0](https://navios.tech/docs/server/reference/migrating-to-2). [CHANGELOG.md](./CHANGELOG.md) has the full list.

## License

MIT. The console logger is ported from [NestJS](https://github.com/nestjs/nest) (MIT). Big thanks to the NestJS team for their work.
