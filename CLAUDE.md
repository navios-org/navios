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
- Follow Prettier config
- Run `yarn turbo run lint --filter=<package>` after making changes

## DI System Testing Rules

### Test File Structure

```typescript
import { asyncInject, Container, inject, Injectable } from '@navios/di'

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

- Always create a **fresh `Container`** in `beforeEach`
- Always call **`container.dispose()`** in `afterEach`
- Use **custom `Registry`** when isolating test services
- Define **`@Injectable()` classes inside test blocks** (not at module level) to avoid cross-test pollution
- Use **`inject()`** for synchronous property injection
- Use **`asyncInject()`** for async property injection
- Test **scope boundaries** explicitly:
  - Singleton: same instance (`expect(inst1).toBe(inst2)`)
  - Transient: different instances (`expect(inst1).not.toBe(inst2)`)
- Test **lifecycle hooks** (`onServiceInit`, `onServiceDestroy`) explicitly

### Mocking Dependencies with TestContainer

```typescript
import { InjectionToken } from '@navios/di'
import { TestContainer } from '@navios/di/testing'

const container = new TestContainer()

// Bind value
const TOKEN = InjectionToken.create<string>('token')
container.bind(TOKEN).toValue('mock-value')

// Bind class
container.bind(SomeToken).toClass(MockClass)

// Clear between tests
await container.clear()
```

### Injection Patterns

```typescript
@Injectable()
class MyService {
  // Synchronous injection - service must already be initialized
  private readonly userService = inject(UserService)

  // Async injection - can wait for initialization (useful for circular dependencies)
  private readonly apiService = asyncInject(ApiService)

  // Optional injection - returns null if service fails
  private readonly optionalService = optional(OptionalService)
}
```
