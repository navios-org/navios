# Legacy decorators

Navios is written for standard (TC39) decorators. A project that compiles with TypeScript's `experimentalDecorators` option imports its decorators from `@navios/core/legacy-compat` instead.

Each legacy decorator adapts the legacy call signature and then calls the same implementation as the standard decorator of the same name. Behaviour and metadata are identical, and both kinds can be used in one application.

## What the entry point exports

```ts
import {
  AttributeFactory,
  Controller,
  Endpoint,
  Factory,
  Injectable,
  Module,
  UseGuards,
  UseInterceptors,
} from '@navios/core/legacy-compat'
```

Everything that is not a decorator is imported from `@navios/core` as usual: `handler`, `reply`, `inject`, `NaviosFactory`, `createContextKey`, exceptions and types. `RequestValue` from `@navios/core` works under both decorator modes.

## Controllers

A controller is written the same way as with standard decorators. Only the import path of the decorators changes:

```ts
import { inject, reply } from '@navios/core'
import { Controller, Endpoint, Injectable, Module, UseGuards } from '@navios/core/legacy-compat'

import type { HandlerParams, RequestContext } from '@navios/core'

@Injectable()
export class UsersService {
  async findById(id: string) {
    return id === '1' ? { id, name: 'Ann' } : null
  }
}

@UseGuards(AuthGuard)
@Controller()
export class UsersController {
  private readonly users = inject(UsersService)

  @Endpoint(getUser)
  async getUser({ urlParams }: HandlerParams<typeof getUser>, ctx: RequestContext) {
    const user = await this.users.findById(urlParams.id)
    return user ?? reply(404, { message: 'User not found' })
  }
}

@Module({ controllers: [UsersController] })
export class AppModule {}
```

`@Endpoint` checks the method against the declaration exactly as the standard decorator does. See [Controllers and handlers](./controllers.md#what-endpoint-checks).

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

Reading is the same as with the standard factory: `AttributeFactory.has(Public, ctx.route)`, `get` and `getAll`.

An attribute created with the standard `AttributeFactory` from `@navios/core` cannot be used as a decorator in a legacy-decorator file. Its value can still be passed in options: `@Controller({ attributes: [Public()] })`.

## `handler()` fields

`handler()` is not a decorator, so it is imported from `@navios/core` and works unchanged in a legacy-decorator project. A controller whose handlers are all `handler()` fields uses only class decorators from this entry point. Attributes from either factory can be passed in its options: `handler(endpoint, { attributes: [Public()] }, fn)`. See [Handlers without decorators](./controllers.md#handlers-without-decorators-handler).

## Removed from the entry point

`Multipart`, `Stream`, `HttpCode` and `Header` no longer exist in either entry point. See the [migration guide](./migration.md).
