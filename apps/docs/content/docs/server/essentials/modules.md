---
title: Modules
---

# Modules

A module is a group of routes with a shared path prefix, shared guards and shared interceptors. An application is created from one root module, and every module reachable from it through `imports` is part of the application.

A module is not a dependency-injection boundary. Services are visible application-wide, and a module never has to list or export them.

```ts
import { Module, provide } from '@navios/server'

// UsersController comes from the Quick start
@Module({
  prefix: '/v1',
  controllers: [UsersController],
  guards: [ApiKeyGuard],
  interceptors: [AuditInterceptor],
  providers: [provide(Mailer, SesMailer)],
})
export class UsersModule {}

@Module({ prefix: '/api', imports: [UsersModule, HealthModule] })
export class AppModule {}
```

## Options

Every option is optional.

| Option          | Type                  | What it does                                                                                             |
| --------------- | --------------------- | -------------------------------------------------------------------------------------------------------- |
| `prefix`        | `string`              | Path prefix for the routes of this module and of the modules it imports                                  |
| `imports`       | module classes        | Modules that become part of the application under this one                                               |
| `controllers`   | controller classes    | The controllers whose handlers this module serves                                                        |
| `guards`        | guard classes         | Guards for the routes of this module and of the modules it imports                                       |
| `interceptors`  | interceptor classes   | Interceptors for the same routes                                                                         |
| `providers`     | `Provider[]`          | `provide(...)` entries, registered application-wide                                                      |
| `requestValues` | request value classes | Request values to build at start-up; see [Per-request state](/docs/server/guides/request-state)          |
| `attributes`    | attribute values      | [Attributes](/docs/server/guides/attributes) for every route of this module, such as `[Public()]`        |

## Prefixes

A route's path is built from, in order: the application's `globalPrefix`, the prefix of each importing module from the outermost inwards, the module's own prefix, and the endpoint's `url`. Leading and trailing slashes are normalised, so `'v1'` and `'/v1/'` mean the same.

With the modules above, `getUser` is served at `GET /api/v1/users/$userId`. With `globalPrefix: '/public'` on the application it becomes `GET /public/api/v1/users/$userId`.

A prefix may contain URL parameters:

```ts
@Controller()
export class MembersController {
  @Endpoint(getUser)
  async getUser({ urlParams }: HandlerParams<typeof getUser>, ctx: RequestContext) {
    ctx.urlParams.orgId // from the module prefix
    urlParams.userId // from the endpoint
    // ...
  }
}

@Module({ prefix: '/orgs/$orgId', controllers: [MembersController] })
export class OrgModule {}
```

The handler's `urlParams` type comes from the endpoint alone, so read prefix parameters from `ctx.urlParams`, where they are plain strings.

A module that has controllers can be mounted under one prefix only. Importing it from two modules with different prefixes fails at `init()`, because its routes would exist twice. A module without controllers may be imported from anywhere.

:::info
A client built from the same declarations knows only the endpoint's `url`. Put the server's prefixes into the client's `baseURL`.
:::

## Module guards and interceptors

A module's guards and interceptors apply to its own routes and to the routes of every module it imports, directly or indirectly. To protect a whole application, put the guard on the root module.

```ts
@Module({ imports: [UsersModule, BillingModule], guards: [ApiKeyGuard] })
export class AppModule {}
```

When a module is reached through several import paths, its routes get the guards along all of them:

```ts
@Module({ imports: [SharedModule], guards: [TenantGuard] })
class TenantModule {}

@Module({ imports: [SharedModule], guards: [AuditGuard] })
class AuditedModule {}

@Module({ imports: [TenantModule, AuditedModule] })
class AppModule {}

// Routes of SharedModule run TenantGuard and AuditGuard
```

The effective lists are computed per application at `init()` and nothing is written back to the classes. Two applications in one process that import the same module under different parents do not affect each other, and the result does not depend on the order in which files are imported.

`@UseGuards` and `@UseInterceptors` placed above `@Module` add to the same lists. How guards at different levels are ordered is covered in [Guards and interceptors](/docs/server/essentials/guards-and-interceptors#attaching-guards).

## Providers

`providers` is a list of [`provide(target, implementation)`](/docs/server/essentials/services#providers-at-a-glance) entries. They are application-wide: a provider listed in any module is visible to every service in the application, because an application has exactly one container and there is nothing for a provider to be private to.

When the same token is provided more than once:

1. The application's `providers` option wins over every module.
2. Between modules, the first one in initialisation order wins, and an imported module is initialised before the module that imports it.

Relying on the second rule is fragile. Provide a token in one place.

## onModuleInit

A module class is instantiated once and may implement `onModuleInit()` for work that has to happen before the application serves requests:

```ts
import { inject, Module } from '@navios/server'

import type { OnModuleInit } from '@navios/server'

@Module({ imports: [UsersModule] })
export class AppModule implements OnModuleInit {
  private readonly migrations = inject(Migrations)

  async onModuleInit() {
    await this.migrations.run()
  }
}
```

Hooks run one at a time in dependency order: a module's hook runs after the hooks of everything it imports. They run before controllers are created and routes are compiled, so an error thrown here stops `init()`.

## Modules added by plugins

A [plugin](/docs/server/guides/plugins) can add a module of its own. Such a module is treated as an additional root: it gets the global prefix, but no prefix or guards from the application's root module.
