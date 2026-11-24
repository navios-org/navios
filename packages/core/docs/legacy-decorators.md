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

## With the field form

The field form needs no method decorator, so a controller only uses class decorators:

```ts
import { handler, inject, reply } from '@navios/core'
import { Controller, Injectable, Module } from '@navios/core/legacy-compat'

@Injectable()
export class UsersService {
  find(id: string) {
    return id === '1' ? { id, name: 'Ann' } : null
  }
}

@Controller()
export class UsersController {
  private readonly users = inject(UsersService)

  getUser = handler(getUser, ({ urlParams }) => {
    return this.users.find(urlParams.id) ?? reply(404, { message: 'User not found' })
  })
}

@Module({ controllers: [UsersController] })
export class AppModule {}
```

This is the recommended way to write a legacy-decorator application.

## With the method form

```ts
import { Controller, Endpoint, UseGuards } from '@navios/core/legacy-compat'

import type { HandlerParams } from '@navios/core'

@UseGuards(AuthGuard)
@Controller()
export class UsersController {
  private readonly users = inject(UsersService)

  @Endpoint(listUsers)
  async listUsers({ params }: HandlerParams<typeof listUsers>) {
    return this.users.list(params.limit)
  }
}
```

## Attributes

Create attributes with the `AttributeFactory` from the legacy entry point, so that calling one returns a legacy decorator:

```ts
import { AttributeFactory } from '@navios/core/legacy-compat'

export const Public = AttributeFactory.createAttribute(Symbol.for('Public'))

@Controller()
export class HealthController {
  @Public()
  ping = handler(ping, () => ({ ok: true }))
}
```

The resulting values also work in `handler(endpoint, { attributes: [Public()] }, fn)`. Reading is the same as with the standard factory: `AttributeFactory.has(Public, ctx.route)`, `get` and `getAll`.

An attribute created with the standard `AttributeFactory` from `@navios/core` cannot be used as a decorator in a legacy-decorator file. It can still be passed in `handler()` options.

## Removed from the entry point

`Multipart`, `Stream`, `HttpCode` and `Header` no longer exist in either entry point. See the [migration guide](./migration.md).
