# @navios/di

A dependency injection container for TypeScript. Classes are registered with standard decorators, `inject()` returns the real instance synchronously, and scopes, lifecycle hooks, tokens and explicit providers cover the rest. It has no runtime dependencies and runs unchanged in Node.js, Bun and the browser.

**[Documentation](https://navios.tech/docs/di/)** · [Quick start](https://navios.tech/docs/di/quick-start) · [API reference](https://navios.tech/docs/di/reference/api)

## Install

```bash
npm install @navios/di@next
```

The 2.0 alpha is published under the `next` tag. All `@navios` packages of a project must have the same alpha version, because an alpha may break between releases.

`@Injectable` and `@Factory` are standard TC39 decorators: TypeScript 5.0 or later, with `experimentalDecorators` off. A schema library is needed only for tokens that take arguments; any [Standard Schema](https://standardschema.dev) library works.

## Example

```ts
import { Container, inject, Injectable, InjectionToken, provide } from '@navios/di'

interface Mailer {
  send(to: string, subject: string): Promise<void>
}

const MAILER = InjectionToken.create<Mailer>('Mailer')

@Injectable({ token: MAILER })
class SmtpMailer implements Mailer {
  async send(to: string, subject: string) {
    // talk to the SMTP server
  }
}

@Injectable()
class UserService {
  private readonly mailer = inject(MAILER)

  async invite(email: string) {
    await this.mailer.send(email, 'You are invited')
  }
}

const container = new Container()
const users = await container.get(UserService)
await users.invite('ada@example.com')

await container.dispose()

// In a test: the same service with another mailer
const sent: string[] = []
const testContainer = new Container({
  providers: [provide(MAILER, { value: { send: async (to) => void sent.push(to) } })],
})
```

`UserService` is a singleton of its container, built on first use together with what it injects. Each `Container` has its own instances, so a fresh container is all the isolation a test needs.

## What else it does

| Need                                        | How                                                                     | Docs                                                                              |
| ------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Declare services and inject them            | `@Injectable()`, `inject()`, `optional()`, `asyncInject()`              | [Services and injection](https://navios.tech/docs/di/essentials/services)         |
| One instance per use, or per unit of work   | `InjectableScope.Transient`, `InjectableScope.Request`, `createScope()` | [Scopes](https://navios.tech/docs/di/essentials/scopes)                           |
| Depend on an interface, pass validated args | `InjectionToken.create`, `.bound`, `.factory`                           | [Tokens](https://navios.tech/docs/di/essentials/tokens)                           |
| Build a value that is not a class instance  | `@Factory()`, `create(ctx)`                                             | [Factories](https://navios.tech/docs/di/essentials/factories)                     |
| Replace or supply an implementation         | `provide()`, `registerProvider()`, `decorate()`, `strict`               | [Providers](https://navios.tech/docs/di/essentials/providers)                     |
| Open and close resources                    | `onServiceInit()`, `onServiceDestroy()`, `dispose()`                    | [Lifecycle](https://navios.tech/docs/di/essentials/lifecycle)                     |
| Drop an instance and what depends on it     | `container.invalidate()`, `onInvalidate()`                              | [Invalidation](https://navios.tech/docs/di/guides/invalidation)                   |
| Two services that need each other           | a `CircularDependency` error with the path; `asyncInject()`             | [Circular dependencies](https://navios.tech/docs/di/guides/circular-dependencies) |
| Mocks, call tracking, auto-mocking          | `TestContainer`, `UnitTestContainer`                                    | [Testing](https://navios.tech/docs/di/guides/testing)                             |
| Know what happens inside `get()`            | synchronous first, asynchronous `onServiceInit`, constructor replay     | [How resolution works](https://navios.tech/docs/di/how-it-works)                  |
| Services in React components                | [`@navios/di-react`](https://www.npmjs.com/package/@navios/di-react)    | [React](https://navios.tech/docs/di/react/)                                       |

Every failed resolution is a `DIError` with a `code`; the codes are listed in the [API reference](https://navios.tech/docs/di/reference/api#error-codes).

## Entry points

| Import                     | Contents                                                                                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@navios/di`               | The container, decorators, injection functions, tokens and errors                                                                                                   |
| `@navios/di/testing`       | `TestContainer` and `UnitTestContainer`                                                                                                                             |
| `@navios/di/legacy-compat` | `Injectable` and `Factory` for projects that keep `experimentalDecorators` on. See [Legacy decorators](https://navios.tech/docs/server/reference/legacy-decorators) |

## Upgrading from 1.x

Registries and priorities became providers, request contexts became scopes, and a singleton that reaches a request-scoped service is now an error. See [Migrating to 2.0](https://navios.tech/docs/di/reference/migrating-to-2) for before-and-after examples, or [CHANGELOG.md](./CHANGELOG.md) for the full list.

## License

MIT
