---
title: Quick start
---

# Quick start

This page takes you from an empty project to two services resolved from a container. `DatabaseService` and `UserService`, declared here, are the pair the rest of the DI docs build on.

## Install

```bash
npm install @navios/di@next
```

:::info
2.0 is an alpha, published under the `next` tag. All `@navios` packages of a project must have the same alpha version, because an alpha may break between releases.
:::

The package has no runtime dependencies. A schema library is only needed for [tokens that take arguments](/docs/di/essentials/tokens#tokens-with-a-schema).

## Check tsconfig

`@Injectable` and `@Factory` are standard TC39 decorators, which TypeScript supports from version 5.0 without a flag. The one requirement is that `experimentalDecorators` is not enabled.

```json title="tsconfig.json"
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext"
  }
}
```

A project that has to keep `experimentalDecorators` on imports the decorators from a separate entry point. [Legacy decorators](/docs/server/reference/legacy-decorators) covers it.

## Declare two services

`@Injectable()` makes a class resolvable. `inject()` in a field initialiser declares a dependency and returns the instance.

```ts title="services.mts"
import { inject, Injectable } from '@navios/di'

@Injectable()
export class DatabaseService {
  private readonly users = [{ id: '1', name: 'Ada' }]

  findUser(id: string) {
    return this.users.find((user) => user.id === id)
  }
}

@Injectable()
export class UserService {
  private readonly db = inject(DatabaseService)

  getUser(id: string) {
    const user = this.db.findUser(id)
    if (!user) {
      throw new Error(`User ${id} not found`)
    }
    return user
  }
}
```

`this.db` is typed as `DatabaseService`. Nothing is passed through the constructor, so adding a dependency never changes how a class is created.

## Resolve from a container

A container builds instances and keeps them. Create one for the application and ask it for the service you need.

```ts title="main.mts"
import { Container } from '@navios/di'

import { DatabaseService, UserService } from './services.mjs'

const container = new Container()

const users = await container.get(UserService)
console.log(users.getUser('1')) // { id: '1', name: 'Ada' }

const db = await container.get(DatabaseService)
console.log(db === (await container.get(DatabaseService))) // true

await container.dispose()
```

Three things happened:

- `container.get(UserService)` constructed `UserService`. Its `inject(DatabaseService)` call constructed `DatabaseService` on the spot.
- Both are singletons by default, so the later `get(DatabaseService)` returned the instance `UserService` already holds. [Scopes](/docs/di/essentials/scopes) lists the alternatives.
- `dispose()` destroyed both, in reverse order of creation. [Lifecycle](/docs/di/essentials/lifecycle) covers the hooks that run at each end.

## Replace a dependency

A container can be told to use a different implementation for a class. This is the basis of testing and of per-environment wiring.

```ts
import { Container, provide } from '@navios/di'

import { DatabaseService, UserService } from './services.mjs'

const container = new Container({
  providers: [
    provide(DatabaseService, {
      value: { findUser: (id: string) => ({ id, name: 'Test user' }) },
    }),
  ],
})

const users = await container.get(UserService)
console.log(users.getUser('42')) // { id: '42', name: 'Test user' }
```

`UserService` did not change. [Providers](/docs/di/essentials/providers) describes every form `provide()` accepts, and [Testing](/docs/di/guides/testing) builds on it.
