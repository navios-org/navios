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
| `attributes`    | attribute values      | [Attributes](/docs/server/guides/attributes) for every route of this module and of the modules it imports, such as `[Public()]` |

## Prefixes

A route's path is built from, in order: the application's `globalPrefix`, the prefix of each importing module from the outermost inwards, the module's own prefix, and the endpoint's `url`. Leading and trailing slashes of a prefix are normalised, so `'v1'` and `'/v1/'` mean the same.

With the modules above, `getUser` is served at `GET /api/v1/users/$userId`. With `globalPrefix: '/public'` on the application it becomes `GET /public/api/v1/users/$userId`.

The endpoint's `url` follows the prefix as it is declared, also its trailing slash. In a module with the prefix `/users`, `url: '/'` is served at `/users/` and at nothing else, and `url: ''` at `/users`. A client that has the prefix in its `baseURL` calls exactly these paths.

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

## Paths

A path, prefixes included, is made of segments, and each segment is one of two things:

- fixed text: any characters except whitespace, `/`, `\`, `?`, `#`, `*`, `$` and `%`. It may be percent-encoded (`/caf%C3%A9` and `/café` are the same path), but it cannot be `.` or `..`, or start with `:`.
- a URL parameter: `$name`, where the name is made of letters, digits and underscores and does not start with a digit. Each name occurs once in the path.

Anything else, such as `/files/$name.json`, `/users/:id`, `/static/*` or `/opt/$id?`, makes `init()` fail with the name of the handler. Routers read such paths in different ways, so a path either means the same on every adapter or does not start. (A declaration that is only used by a client, for another API, may have parameters within a segment.)

When a request is matched:

- Fixed text wins over a parameter, at the first segment where two routes differ. The order of registration does not matter.
- A parameter matches one segment that is not empty, `.` or `..`. Its value is decoded.
- The trailing slash has to be there, or not be there, as declared.
- `HEAD` is answered by the `GET` route, with its headers and without a body, unless the path has a `HEAD` route of its own.
- A request to a path that has routes for other methods only is answered with 405 and an `Allow` header. Other unmatched requests get the [not-found response](/docs/server/essentials/errors#responders).

## Module guards and interceptors

A module's guards and interceptors apply to its own routes and to the routes of every module it imports, directly or indirectly. A guard on the root module covers every module that it imports.

```ts
@Module({ imports: [UsersModule, BillingModule], guards: [ApiKeyGuard] })
export class AppModule {}
```

To protect a whole application, with the modules that [plugins add](#modules-added-by-plugins), use the [`guards` option](/docs/server/essentials/application#options) of `NaviosFactory.create` instead.

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

Attributes are inherited in the same way, but do not add up: a route whose module is imported by several others has to get one value of an attribute from all of them, unless the handler, its controller or the module sets its own. If `TenantModule` above had `attributes: [Public()]` and `AuditedModule` had not, `init()` would fail and name both import paths, because the routes of `SharedModule` would be public or not depending on which of the two is meant. Set the attribute on the controllers or handlers it is meant for then. A shared module without routes has nothing to inherit it and starts.

Modules cannot import each other in a cycle; `init()` fails with the path of the cycle.

A class that extends a module class and is a module itself inherits its guards, interceptors and attributes. A class can be made a module once.

`@UseGuards` and `@UseInterceptors` placed above `@Module` add to the same lists. How guards at different levels are ordered is covered in [Guards and interceptors](/docs/server/essentials/guards-and-interceptors#attaching-guards).

## Providers

`providers` is a list of [`provide(target, implementation)`](/docs/server/essentials/services#providers-at-a-glance) entries. They are application-wide: a provider listed in any module is visible to every service in the application, because an application has exactly one container and there is nothing for a provider to be private to.

When the same token is provided more than once:

1. What is in the [`container`](/docs/server/essentials/application#options) the application was given wins over everything else, which is how a test replaces a service.
2. Then the application's `providers` option.
3. Then a [plugin](/docs/server/guides/plugins) that calls `api.provide()`.
4. Then the modules. A module wins over the modules it imports, directly or not, and the application's modules win over those that plugins add. Two modules that provide different things for a token without one importing the other fail `init()`, unless a module that imports both, or one of the levels above, decides. The same class, value, factory function or alias in both counts as one.
5. Last, the default of the token.

A provider has to be there before its token is resolved. One that comes too late, because the token was resolved with `app.get()` before `init()` or while a transport was created, fails `init()` instead of being ignored.

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

A [plugin](/docs/server/guides/plugins) can add a module of its own. Such a module is treated as an additional root: it gets the global prefix, but no prefix or guards from the application's root module. The `guards` option of the application applies to it.
