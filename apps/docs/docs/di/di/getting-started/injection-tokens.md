---
sidebar_position: 3
---

# Injection Tokens

Injection Tokens are the foundation of Navios DI. Every service and factory has an Injection Token that identifies it in the DI system.

## What are Injection Tokens?

An Injection Token is a unique identifier used by the DI system to register and resolve services. Every `@Injectable` service and `@Factory` has an Injection Token:

- **Auto-created**: When you use `@Injectable()` without a `token` option, the DI system automatically creates a token from the class
- **Explicit**: You can provide your own token using the `token` option in `@Injectable()` or `@Factory()`

The token is what the Registry uses to store service metadata and what the Container uses to resolve services.

## Automatic Token Creation

When you use `@Injectable()` without specifying a token, the DI system automatically creates one:

```typescript
@Injectable()
class UserService {
  // An Injection Token is automatically created for UserService
}
```

Internally, the DI system creates a token that represents `UserService`. When you call `container.get(UserService)`, the container uses this token to find and resolve the service.

## Explicit Token Creation

You can create your own Injection Token and use it explicitly:

```typescript
import { Injectable, InjectionToken } from '@navios/di'

// Create an injection token
const USER_SERVICE_TOKEN = InjectionToken.create<UserService>('UserService')

// Register the service with the token
@Injectable({ token: USER_SERVICE_TOKEN })
class UserService {
  getUsers() {
    return ['Alice', 'Bob']
  }
}

// Resolve using the token
const container = new Container()
const userService = await container.get(USER_SERVICE_TOKEN)
```

## Why Use Explicit Tokens?

Explicit tokens are useful when:

- **Interface-based injection**: You want to inject by interface rather than concrete class
- **Multiple implementations**: You want multiple services to register for the same token (using priority)
- **Configuration services**: You need tokens with schemas for type-safe configuration

## Tokens with Schemas

Injection Tokens can include Zod schemas for type-safe configuration:

```typescript
import { Injectable, InjectionToken } from '@navios/di'
import { z } from 'zod'

// Define a schema for configuration
const configSchema = z.object({
  apiUrl: z.string(),
  timeout: z.number(),
})

// Create a token with schema
const CONFIG_TOKEN = InjectionToken.create<Config, typeof configSchema>(
  'APP_CONFIG',
  configSchema
)

// Register a service with the token
@Injectable({ token: CONFIG_TOKEN })
class ConfigService {
  constructor(private config: z.infer<typeof configSchema>) {}

  getApiUrl() {
    return this.config.apiUrl
  }
}

// Use with validated arguments
const container = new Container()
const config = await container.get(CONFIG_TOKEN, {
  apiUrl: 'https://api.example.com',
  timeout: 5000,
})
```

The schema validates the arguments when resolving the service, ensuring type safety.

## Token-Based Resolution

Services are resolved by their Injection Token, not by class directly. This means:

1. When you use `@Injectable()`, a token is created (or you provide one)
2. The service is registered in the Registry using this token
3. When you call `container.get(ServiceClass)`, the container converts the class to its token and looks it up
4. The Registry returns the service metadata, and the Container creates/resolves the instance

This token-based system enables:
- Multiple services per token (with priority)
- Interface-based injection
- Dynamic service resolution
- Service overrides

## Next Steps

- **[Bound and Factory Tokens](/docs/di/di/getting-started/bound-factory-tokens)** - Learn about Bound and Factory Injection Tokens