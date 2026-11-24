---
title: Attributes
---

# Attributes

An attribute is typed metadata attached to a module, a controller or a handler. It does nothing by itself: a guard or an interceptor reads it from `ctx.route` to decide what to do, and tools such as the [OpenAPI plugin](/docs/server/guides/openapi) read it from `app.routes()`.

## Creating an attribute

```ts title="roles.mts"
import { AttributeFactory } from '@navios/core'
import { z } from 'zod/v4'

// A flag: present or absent
export const Public = AttributeFactory.createAttribute(Symbol.for('Public'))

// A value, validated when the attribute is applied
export const Roles = AttributeFactory.createAttribute(
  Symbol.for('Roles'),
  z.array(z.string()).min(1),
)
```

The schema can be any Standard Schema. It must validate synchronously, because an attribute is applied while classes are being defined. An invalid value throws at that point, so `@Roles([])` here stops the process at start-up rather than failing a request later.

An attribute is identified by its symbol. Use `Symbol.for('name')` when the attribute may be loaded from two copies of a package, and a plain `Symbol('name')` otherwise.

## Applying an attribute

Calling an attribute gives a decorator for a module, a controller or a handler.

```ts
import { Controller, Endpoint, Module } from '@navios/core'

import { AuthGuard } from './auth.guard.mjs'
import { getStats, purgeUsers } from './admin.mjs'
import { Roles } from './roles.mjs'
import { RolesGuard } from './roles.guard.mjs'

@Roles(['staff', 'admin'])
@Controller()
export class AdminController {
  @Roles(['admin'])
  @Endpoint(purgeUsers)
  async purge() {
    // ...
  }

  @Endpoint(getStats)
  async stats() {
    return { users: 1 }
  }
}

@Module({ controllers: [AdminController], guards: [AuthGuard, RolesGuard] })
export class AdminModule {}
```

On a class, place the attribute above `@Controller` or `@Module`. On a method, its position relative to `@Endpoint` does not matter, but a method with an attribute and no `@Endpoint` fails at `init()`.

Calling an attribute also returns its value, which the `attributes` option of `@Module`, `@Controller` and `handler()` accepts:

```ts
@Controller({ attributes: [Roles(['staff'])] })
export class ReportsController {
  ping = handler(ping, { attributes: [Public()] }, () => ({ ok: true }))
}
```

## Reading an attribute

`AttributeFactory` reads from a `RouteInfo`. During a request that is `ctx.route`.

```ts title="roles.guard.mts"
import { AttributeFactory, Injectable } from '@navios/core'

import type { Guard, RequestContext } from '@navios/core'

import { CurrentUser } from './auth.guard.mjs'
import { Roles } from './roles.mjs'

@Injectable()
export class RolesGuard implements Guard {
  canActivate(ctx: RequestContext) {
    const required = AttributeFactory.get(Roles, ctx.route) // string[] | null
    if (!required) {
      return true
    }
    const user = ctx.find(CurrentUser)
    if (!user) {
      return false
    }
    return required.some((role) => user.roles.includes(role))
  }
}
```

`CurrentUser` is the context key set by the guard from [Authentication with JWT](/docs/server/guides/authentication). With the controller above, `purge` needs the `admin` role and `stats` needs `staff` or `admin`; a user with neither gets 403.

| Call                                        | Result                                                                                                                             |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `AttributeFactory.has(attribute, route)`    | `true` when the handler, its controller or its module has the attribute                                                            |
| `AttributeFactory.get(attribute, route)`    | The most specific value: the handler's, else the controller's, else the module's. `null` when none has it. A flag's value is `true` |
| `AttributeFactory.getAll(attribute, route)` | Every value, most specific first: handler, controller, module                                                                      |

For the module level, the nearest module that sets the attribute wins: the route's own module, else the module that imports it, and so on outwards.

`get` returns one level's value and does not merge levels. `@Roles(['admin'])` on `purge` replaces the controller's `['staff', 'admin']` for that handler. When you want the levels combined, as tags usually are, use `getAll`.

:::info
Attributes do not cancel each other. A `@Public()` handler in a controller marked `@Roles([...])` still carries the roles, and each guard decides what that means. The `RolesGuard` above denies such a route to an anonymous caller; check `Public` in it too if a public route should win.
:::

## Reading outside a request

`app.routes()` returns the same `RouteInfo` objects after `init()`, so a script or a plugin can inspect every route's attributes:

```ts
await app.init()

for (const route of app.routes()) {
  const roles = AttributeFactory.get(Roles, route)
  console.log(route.method, route.path, roles ?? 'any signed-in user')
}
```

A [plugin](/docs/server/guides/plugins) receives the same list in its `onBootstrap` hook. This is how `@navios/openapi` turns `ApiTag`, `ApiSummary` and its other attributes into a document without touching the request pipeline.
