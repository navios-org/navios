# @navios/di-react

React bindings for [`@navios/di`](https://www.npmjs.com/package/@navios/di). A provider puts a container in context, and hooks resolve services from it, re-render when a service is invalidated, and create scopes that live as long as a part of the component tree.

**[Documentation](https://navios.tech/docs/di/react/)** · [API reference](https://navios.tech/docs/di/reference/react-api)

## Install

```bash
npm install @navios/di-react @navios/di
```

Requires `react` `^18.0.0 || ^19.0.0`. The services are compiled by your bundler, so it has to handle standard TC39 decorators.

## Example

```tsx
import { Container, Injectable } from '@navios/di'
import { ContainerProvider, useService, useSuspenseService } from '@navios/di-react'
import { Suspense } from 'react'

@Injectable()
class GreetingService {
  greet(name: string) {
    return `Hello, ${name}`
  }
}

const container = new Container()

function Greeting({ name }: { name: string }) {
  const { data: greetings, error } = useService(GreetingService)

  if (error) return <p>{error.message}</p>
  if (!greetings) return <p>Loading…</p>

  return <p>{greetings.greet(name)}</p>
}

function SuspendingGreeting({ name }: { name: string }) {
  const greetings = useSuspenseService(GreetingService)

  return <p>{greetings.greet(name)}</p>
}

export function App() {
  return (
    <ContainerProvider container={container}>
      <Greeting name="Ada" />
      <Suspense fallback={<p>Loading…</p>}>
        <SuspendingGreeting name="Grace" />
      </Suspense>
    </ContainerProvider>
  )
}
```

`data` is `undefined` until the instance is ready, because a service may initialise asynchronously; when the container already holds the instance, the first render returns it. Create the container once, outside any component, so that it is the same object on every render.

## What you get

| Need                                           | How                                                           | Docs                                                                                                          |
| ---------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| A service with loading and error state         | `useService(token)`                                           | [useService](https://navios.tech/docs/di/react/using-services#useservice)                                     |
| A service through Suspense                     | `useSuspenseService(token)`                                   | [Suspense](https://navios.tech/docs/di/react/using-services#suspense)                                         |
| A service that takes arguments                 | `useService(token, args)`, compared by JSON form              | [Services that take arguments](https://navios.tech/docs/di/react/using-services#services-that-take-arguments) |
| A service that may have no provider            | `useOptionalService(token)`, `isNotFound`                     | [Optional services](https://navios.tech/docs/di/react/using-services#optional-services)                       |
| The container in an event handler or an effect | `useContainer()`, `useRootContainer()`                        | [Outside render](https://navios.tech/docs/di/react/using-services#outside-render)                             |
| State per row, modal or tenant                 | `<ScopeProvider>` with request-scoped services                | [ScopeProvider](https://navios.tech/docs/di/react/scopes-and-invalidation#scopeprovider)                      |
| The scope's id and metadata                    | `useScope()`, `useScopeMetadata(key)`, `useScopedContainer()` | [Scope id and metadata](https://navios.tech/docs/di/react/scopes-and-invalidation#scope-id-and-metadata)      |
| Replace an instance and re-render its users    | `useInvalidateInstance()`, `container.invalidate()`           | [Invalidation](https://navios.tech/docs/di/react/scopes-and-invalidation#invalidation)                        |
| Fakes in tests and stories                     | `new Container({ providers })` given to `ContainerProvider`   | [Quick start](https://navios.tech/docs/di/react/#provide-the-container)                                       |

Two rules worth knowing before you start: `useSuspenseService` needs an error boundary above it as well as a `Suspense` boundary, and for a request-scoped service that `Suspense` boundary goes inside the `ScopeProvider`, not around it.

## Changes

See [CHANGELOG.md](./CHANGELOG.md).

## License

MIT
