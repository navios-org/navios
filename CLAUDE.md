# Claude Code Rules for Navios Repository

## Package Manager & Task Runner

- **Use `yarn`** instead of `npm` for all package management commands
- **Use `turbo`** for running most commands (build, test, lint, etc.)
  - Example: `yarn turbo run build --filter=@navios/core`, `yarn turbo run test:ci --filter=@navios/core`
  - Run all: `yarn build`, `yarn test:ci`, `yarn lint`

## File Conventions

- Use **`.mts`** extension for all TypeScript files (ES module syntax)
- Unit tests: **`*.spec.mts`**
- Type tests: **`*.spec-d.mts`**

## Code Style

- No semicolons
- Single quotes
- Follow Oxlint config
- Run `yarn turbo run lint --filter=<package>` after making changes

## DI System Testing Rules

### Test File Structure

```ts
import { Container, inject, Injectable } from '@navios/di'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

describe('MyService', () => {
  let container: Container

  beforeEach(() => {
    container = new Container()
  })

  afterEach(async () => {
    await container.dispose()
  })

  it('should do something', async () => {
    @Injectable()
    class TestService {
      // ...
    }

    const service = await container.get(TestService)
    expect(service).toBeDefined()
  })
})
```

### Key Patterns

- Always create a **fresh `Container`** in `beforeEach`. A new container is the isolation; there is no `Registry`.
- Always call **`container.dispose()`** in `afterEach`
- Define **`@Injectable()` classes inside test blocks** (not at module level) to avoid cross-test pollution
- A token has **one default provider**. Give an alternative implementation a plain `@Injectable()` and bind it with `provide()`; a second `@Injectable({ token })` throws `ProviderConflict`.
- Resolve request-scoped services from **`container.createScope()`** and dispose the scope
- Test **scope boundaries** explicitly:
  - Singleton: same instance (`expect(inst1).toBe(inst2)`)
  - Transient: different instances (`expect(inst1).not.toBe(inst2)`)
  - Singleton injecting a request-scoped service: `DIErrorCode.ScopeMismatchError`
- Test **lifecycle hooks** (`onServiceInit`, `onServiceDestroy`) explicitly

### Mocking Dependencies

```ts
import { Container, InjectionToken, provide } from '@navios/di'
import { TestContainer } from '@navios/di/testing'

// Providers on a plain container
const TOKEN = InjectionToken.create<string>('token')
const container = new Container({
  providers: [provide(SomeToken, MockClass), provide(TOKEN, { value: 'mock-value' })],
})

// Or the fluent API of TestContainer
const testContainer = new TestContainer()
testContainer.bind(TOKEN).toValue('mock-value')
testContainer.bind(SomeToken).toClass(MockClass)

// Clear between tests
await testContainer.clear()
```

### Injection Patterns

```ts
@Injectable()
class MyService {
  // Returns the real instance. Works for every scope; a transient gets a new instance per call.
  private readonly userService = inject(UserService)

  // Returns a promise. Only for breaking a circular dependency.
  private readonly apiService = asyncInject(ApiService)

  // Returns null only when nothing provides the token. Other errors propagate.
  private readonly optionalService = optional(OptionalToken)
}
```
