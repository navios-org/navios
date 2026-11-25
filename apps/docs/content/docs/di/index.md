---
title: Introduction
---

# Introduction

`@navios/di` is a dependency injection container for TypeScript. A class marked `@Injectable()` declares what it needs with `inject()`, and a container builds it together with everything it depends on.

```ts
import { Container, inject, Injectable } from '@navios/di'

@Injectable()
class DatabaseService {
  findUser(id: string) {
    return { id, name: 'Ada' }
  }
}

@Injectable()
class UserService {
  private readonly db = inject(DatabaseService)

  getUser(id: string) {
    return this.db.findUser(id)
  }
}

const container = new Container()
const users = await container.get(UserService)
//    ^? UserService
```

There is no module file to maintain and no list of providers to keep in sync. A class registers itself when it is decorated, and a container finds it through the class.

## Design principles

| Principle                          | What it means in practice                                                                                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Standard decorators                | `@Injectable` and `@Factory` are TC39 decorators. `experimentalDecorators` stays off, and nothing depends on `reflect-metadata` or emitted type metadata.                               |
| Dependencies are values, not types | `inject(DatabaseService)` is an ordinary function call in a field initialiser. The return type is inferred, and it works the same in every bundler and runtime.                        |
| Synchronous first                  | A dependency is built inside the constructor that asks for it. Resolution only waits when something really is asynchronous. See [How resolution works](/docs/di/how-it-works).         |
| One default, explicit overrides    | A token has one default provider. A container replaces it with `provide()`, which is how tests and environments swap implementations. See [Providers](/docs/di/essentials/providers). |
| Declared scopes                    | A service lives exactly as long as its scope says. A singleton that reaches a request-scoped service is an error, not a silent change. See [Scopes](/docs/di/essentials/scopes).       |
| No dependencies                    | The package has no runtime dependencies. Tokens that take arguments accept any [Standard Schema](https://standardschema.dev) library.                                                 |

## Where it is used

The container has no knowledge of HTTP, React or the command line. Each of these builds on it:

- **Navios server.** Controllers, guards and services are injectable classes, and every request gets its own scope. `@navios/server` re-exports the DI API, so server code imports it from there. Start at [Services and injection](/docs/server/essentials/services).
- **React.** `@navios/di-react` puts a container in context and resolves services in components with hooks. Start at the [React quick start](/docs/di/react/).
- **Commander.** CLI commands are injectable classes resolved from the same kind of container. See [Dependency injection in Commander](/docs/commander/guides/dependency-injection).
- **On its own.** Scripts, workers and libraries can create a `Container` directly. The [Quick start](/docs/di/quick-start) does exactly that.

It runs unchanged on Node.js, Bun, Deno and in the browser.
