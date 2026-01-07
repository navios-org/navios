---
sidebar_position: 6
---

# Service Override

Navios DI allows multiple services to register for the same Injection Token. The service with the highest priority is resolved when the token is requested.

## How Service Override Works

Services are identified by their Injection Token, not by class. This means:

1. Multiple services can register for the same token
2. Each registration can have a priority level
3. When resolving a token, the service with the highest priority wins
4. If priorities are equal, the last registered service wins

## Basic Override

Register multiple services for the same token with different priorities:

```typescript
import { Injectable, InjectionToken } from '@navios/di'

// Create a token
const USER_SERVICE_TOKEN = InjectionToken.create<UserService>('UserService')

// Default service (priority: 0)
@Injectable({ token: USER_SERVICE_TOKEN, priority: 100 })
class DefaultUserService {
  getUsers() {
    return ['Alice', 'Bob']
  }
}

// Override service (priority: 200 - wins)
@Injectable({ token: USER_SERVICE_TOKEN, priority: 200 })
class OverrideUserService {
  getUsers() {
    return ['Charlie', 'David']
  }
}

// When resolving, OverrideUserService will be returned
const container = new Container()
const service = await container.get(USER_SERVICE_TOKEN) // Returns OverrideUserService
```

## Priority Rules

- **Higher priority wins**: When multiple services register for the same token, the one with the highest priority is resolved
- **Default priority is 0**: If no priority is specified, it defaults to 0
- **Equal priority**: If two services have the same priority, the last registered one wins
- **Priority can be any number**: Use any numeric value, higher numbers = higher priority

## Retrieving All Registrations

You can retrieve all registrations for a token, sorted by priority:

```typescript
const registry = container.getRegistry()
const allRegistrations = registry.getAll(USER_SERVICE_TOKEN)
// Returns both services, sorted by priority (highest first)
// allRegistrations[0] = OverrideUserService (priority: 200)
// allRegistrations[1] = DefaultUserService (priority: 100)
```

This is useful for:
- Debugging which services are registered
- Understanding the override chain
- Implementing custom resolution logic

## Override with Factories

Factories can also use priority for overrides:

```typescript
import { Factory, InjectionToken } from '@navios/di'

const SERVICE_TOKEN = InjectionToken.create<Service>('Service')

// Default factory
@Factory({ token: SERVICE_TOKEN, priority: 100 })
class DefaultFactory {
  create() {
    return new DefaultService()
  }
}

// Override factory (higher priority)
@Factory({ token: SERVICE_TOKEN, priority: 200 })
class OverrideFactory {
  create() {
    return new OverrideService()
  }
}
```

## When to Use Overrides

Service overrides are useful for:

- **Environment-specific implementations**: Different implementations for development vs production
- **Feature flags**: Enable/disable features by overriding services
- **Testing**: Override services with mocks in tests
- **Plugin systems**: Allow plugins to override core services
- **A/B testing**: Switch between different implementations

## Example: Environment-Specific Override

```typescript
import { Injectable, InjectionToken } from '@navios/di'

const EMAIL_SERVICE_TOKEN = InjectionToken.create<EmailService>('EmailService')

// Development email service (logs to console)
@Injectable({ token: EMAIL_SERVICE_TOKEN, priority: 100 })
class DevEmailService {
  async sendEmail(to: string, subject: string) {
    console.log(`[DEV] Would send email to ${to}: ${subject}`)
  }
}

// Production email service (sends real emails)
@Injectable({ token: EMAIL_SERVICE_TOKEN, priority: 200 })
class ProdEmailService {
  async sendEmail(to: string, subject: string) {
    // Real email sending logic
  }
}

// In production, ProdEmailService will be used
// In development, you can control which one is registered
```

## Best Practices

1. **Use descriptive priorities**: Use meaningful priority values (e.g., 100 for default, 200 for overrides)
2. **Document overrides**: Comment why a service overrides another
3. **Test overrides**: Ensure your override logic works as expected
4. **Use tokens for overrides**: Always use explicit tokens when implementing overrides

## Next Steps

- **[Architecture Overview](/docs/di/di/architecture/overview)** - Understand the DI system architecture
- **[Core Concepts](/docs/di/di/architecture/core-concepts)** - Deep dive into core concepts