---
sidebar_position: 9
---

# Browser Support

Navios DI fully supports browser environments with automatic optimizations. This guide covers how browser support works and what to consider when using DI in the browser.

## Automatic Environment Detection

Navios DI automatically detects the runtime environment and uses the appropriate implementation:

| Environment | Context Storage | Circular Detection |
|-------------|-----------------|-------------------|
| Node.js (dev) | `AsyncLocalStorage` | Full async-aware |
| Node.js (prod) | No-op | Disabled (performance) |
| Bun | `AsyncLocalStorage` | Full async-aware |
| Deno | `AsyncLocalStorage` | Full async-aware |
| Browser | `SyncLocalStorage` | Synchronous only |

You don't need to configure anything - bundlers like Vite, webpack, and esbuild automatically select the browser entry point via `package.json` exports.

## How It Works

### Browser Entry Point

When bundling for browsers, the `browser` condition in `package.json` exports directs bundlers to use a dedicated browser build:

```json
{
  "exports": {
    ".": {
      "browser": {
        "types": "./lib/browser/index.d.mts",
        "default": "./lib/browser/index.mjs"
      },
      "node": { ... }
    }
  }
}
```

### SyncLocalStorage

In browsers, Navios DI uses `SyncLocalStorage` - a stack-based polyfill that provides the same API as Node's `AsyncLocalStorage` but only works synchronously:

```typescript
// This works the same in browser and Node.js
@Injectable()
class ServiceA {
  private serviceB = inject(ServiceB)
}
```

## Browser Limitations

### Async Context Tracking

In browsers, context does NOT propagate across async boundaries:

```typescript
// ❌ Context is lost across async boundaries in browser
async function asyncOperation() {
  // Context from outer scope is NOT available here
  await somePromise
  // inject() may not work correctly after await
}

// ✅ Keep DI resolution synchronous
@Injectable()
class MyService {
  // This works - inject() is called synchronously during construction
  private dependency = inject(OtherService)
}
```

This is acceptable because:
1. Service constructors are typically synchronous
2. Circular dependency detection mainly needs sync tracking
3. Dependencies are resolved during instantiation, not async operations

### No async_hooks

The `node:async_hooks` module is not available in browsers. Navios DI handles this automatically by using `SyncLocalStorage` instead.

## Production Optimization

In production (`NODE_ENV=production`), circular dependency detection is disabled for performance:

```bash
# Circular detection enabled (development)
NODE_ENV=development npm start

# Circular detection disabled (production)
NODE_ENV=production npm run build
```

This provides faster DI resolution in production while keeping helpful error messages during development.

## Using with Bundlers

### Vite

Vite automatically uses the browser entry point. No configuration needed:

```typescript
// vite.config.ts
export default defineConfig({
  // Works out of the box
})
```

### webpack

webpack respects the `browser` condition in exports by default:

```javascript
// webpack.config.js
module.exports = {
  resolve: {
    conditionNames: ['browser', 'import', 'default']
  }
}
```

### esbuild

esbuild uses the browser entry when bundling for browser:

```bash
esbuild src/index.ts --bundle --platform=browser
```

## Framework Integration

### React

Navios DI works seamlessly with React in browsers. See the [DI React documentation](/docs/di/di-react/getting-started) for React-specific patterns.

```typescript
import { Container, inject, Injectable } from '@navios/di'
import { ContainerProvider, useService } from '@navios/di-react'

@Injectable()
class ApiService {
  async fetchUsers() {
    return fetch('/api/users').then(r => r.json())
  }
}

function App() {
  return (
    <ContainerProvider container={new Container()}>
      <UserList />
    </ContainerProvider>
  )
}
```

### Vue

```typescript
import { Container, inject, Injectable } from '@navios/di'

@Injectable()
class UserService {
  private api = inject(ApiService)
}

// In setup
const container = new Container()
provide('container', container)
```

## Best Practices

### 1. Keep Constructors Synchronous

```typescript
// ✅ Good: Synchronous constructor
@Injectable()
class MyService {
  private dep = inject(OtherService)

  // Async work in lifecycle hook
  async onServiceInit() {
    await this.dep.initialize()
  }
}

// ❌ Avoid: Complex async in constructor
@Injectable()
class MyService {
  constructor() {
    // Don't do async work here
  }
}
```

### 2. Use asyncInject for Circular Dependencies

```typescript
// Works the same in browser and Node.js
@Injectable()
class ServiceA {
  private serviceB = asyncInject(ServiceB)

  async doSomething() {
    const b = await this.serviceB
    return b.process()
  }
}
```

### 3. Test in Both Environments

If your code runs in both Node.js and browsers, test in both:

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    projects: [
      { test: { name: 'node', environment: 'node' } },
      { test: { name: 'browser', environment: 'jsdom' } }
    ]
  }
})
```

## Troubleshooting

### "AsyncLocalStorage is not defined"

**Problem**: Your bundler is using the Node.js entry in a browser context.

**Solution**: Ensure your bundler is configured to use the `browser` condition:

```javascript
// webpack
resolve: {
  conditionNames: ['browser', 'import', 'default']
}
```

### Circular Dependency Not Detected

**Problem**: Circular dependency works in development but fails in production.

**Solution**:
- Always test with `NODE_ENV=development` first
- Use `asyncInject()` to explicitly break circular dependencies
- Don't rely on circular detection in production

### Context Lost in Async Code

**Problem**: `inject()` doesn't work correctly after async operations.

**Solution**:
- Keep `inject()` calls synchronous in constructors
- Use `asyncInject()` for services needed after async boundaries
- Store injected services in instance properties before async operations

## Next Steps

- Learn about [circular dependencies](/docs/di/di/guides/circular-dependencies) and how to resolve them
- Explore [DI React](/docs/di/di-react/overview) for React integration
- Check the [API Reference](/docs/di/di/api-reference) for complete documentation
