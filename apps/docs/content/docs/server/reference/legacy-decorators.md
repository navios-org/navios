---
title: Legacy decorators
---

# Legacy decorators

Navios is written for standard (TC39) decorators, and the rest of these docs assume them. A project that keeps TypeScript's `experimentalDecorators` option on, for example because another library in the same code base needs it, imports its decorators from the `legacy-compat` entry points instead.

Each legacy decorator adapts the legacy call signature and then calls the same implementation as the standard decorator of the same name. Behaviour and metadata are identical, so everything else on this site applies unchanged.

```json title="tsconfig.json"
{
  "compilerOptions": {
    "experimentalDecorators": true
  }
}
```

## Entry points

| Entry point                      | Decorators                                                                                   | Also exports                                                                                           |
| -------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `@navios/core/legacy-compat`     | `Controller`, `Module`, `Endpoint`, `UseGuards`, `UseInterceptors`, `Injectable`, `Factory`  | `AttributeFactory`, `createClassContext`, `createMethodContext`                                        |
| `@navios/di/legacy-compat`       | `Injectable`, `Factory`                                                                      | `createClassContext`, `createMethodContext`                                                            |
| `@navios/schedule/legacy-compat` | `Schedulable`, `Cron`                                                                        | `Schedule`, `SchedulerService`, `schedulePlugin`, the metadata helpers, and the two context functions  |

`Injectable` and `Factory` from the core entry point are the ones from `@navios/di/legacy-compat`. Server code imports them from core, like every other DI name.

Everything that is not a decorator is imported from the package's main entry as usual: `handler`, `reply`, `inject`, `NaviosFactory`, `createContextKey`, exceptions and types from `@navios/core`. `@RequestValue()` from `@navios/core` works under both decorator modes.

## Controllers and modules

A controller is written the same way as with standard decorators. Only the import path of the decorators changes.

```ts title="users.controller.mts"
import { inject, reply } from '@navios/core'
import { Controller, Endpoint, Injectable, Module, UseGuards } from '@navios/core/legacy-compat'

import type { HandlerParams, RequestContext } from '@navios/core'

import { AuthGuard } from './auth.guard.mjs'
import { getUser } from './users.mjs'

@Injectable()
export class UsersService {
  async findById(id: string) {
    return id === '1' ? { id, name: 'Ada', email: 'ada@example.com' } : null
  }
}

@UseGuards(AuthGuard)
@Controller()
export class UsersController {
  private readonly users = inject(UsersService)

  @Endpoint(getUser)
  async getUser({ urlParams }: HandlerParams<typeof getUser>, ctx: RequestContext) {
    const user = await this.users.findById(urlParams.userId)
    return user ?? reply(404, { message: 'User not found' })
  }
}

@Module({ controllers: [UsersController] })
export class AppModule {}
```

`@Endpoint` checks the method's parameters and return value against the declaration exactly as the standard decorator does. See [Controllers and handlers](/docs/server/essentials/controllers).

`handler()` is not a decorator, so it is imported from `@navios/core` and works unchanged. A controller whose handlers are all `handler()` fields uses only class decorators from the legacy entry point.

## Attributes

Create attributes with the `AttributeFactory` from the legacy entry point, so that calling one returns a legacy decorator:

```ts
import { AttributeFactory, Controller, Endpoint } from '@navios/core/legacy-compat'

export const Public = AttributeFactory.createAttribute(Symbol.for('Public'))

@Controller()
export class HealthController {
  @Public()
  @Endpoint(ping)
  async ping() {
    return { ok: true }
  }
}
```

Reading is the same as with the standard factory, for example `AttributeFactory.has(Public, ctx.route)` in a guard. See [Attributes](/docs/server/guides/attributes).

An attribute created with the standard `AttributeFactory` from `@navios/core` cannot be applied as a decorator in a legacy-decorator file. It can still be passed in options: `@Controller({ attributes: [Public()] })`, or `handler(endpoint, { attributes: [Public()] }, fn)`.

## Services and factories outside a server

Code that uses `@navios/di` without the server imports the two decorators from the DI entry point. `inject`, `Container` and the rest come from `@navios/di`.

```ts
import { inject } from '@navios/di'
import { Factory, Injectable } from '@navios/di/legacy-compat'

@Injectable()
export class DatabaseService {
  query(sql: string) {
    return [] as unknown[]
  }
}

@Injectable()
export class UserService {
  private readonly db = inject(DatabaseService)
}

@Factory()
export class ClockFactory {
  create() {
    return { now: () => Date.now() }
  }
}
```

## Scheduled jobs

```ts title="cleanup.service.mts"
import { Cron, Schedulable, Schedule } from '@navios/schedule/legacy-compat'

@Schedulable()
export class CleanupService {
  @Cron(Schedule.EveryDay)
  async purgeExpiredSessions() {
    // ...
  }
}
```

`schedulePlugin` and `SchedulerService` are the same objects as in `@navios/schedule`, so registration is as described in [Scheduled jobs](/docs/server/guides/scheduled-jobs). A `@Cron` method must be `async`.

## Other packages

- `@navios/openapi/legacy-compat` exports the documentation attributes (`ApiTag`, `ApiOperation`, `ApiSummary`, `ApiDeprecated`, `ApiSecurity`, `ApiExclude`, `ApiStream`) as legacy decorators, next to `openApiPlugin`.
- `@navios/otel/legacy-compat` exports `Traced` and `Traceable`.
- `@Component()` from `@navios/adapter-xml` works under both decorator modes from its main entry.
- `@navios/jwt` has no decorators.

## Writing your own legacy decorator

`createClassContext(target)` and `createMethodContext(target, propertyKey, descriptor)` build the context object a standard decorator expects from the arguments a legacy decorator receives. A library that ships a standard decorator can offer a legacy form by wrapping it:

```ts
import { createClassContext } from '@navios/core/legacy-compat'

import type { ClassType } from '@navios/core'

import { Audited as StandardAudited } from './audited.mjs'

export function Audited() {
  return <T extends ClassType>(target: T): T => StandardAudited()(target, createClassContext(target))
}
```
