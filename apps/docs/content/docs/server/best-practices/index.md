---
sidebar_position: 1
title: Best Practices
---

# Best Practices

Quick reference for structuring Navios applications.

## Project Structure

Organize your application with a clear, scalable structure:

```
src/
├── api/                    # API endpoint definitions
│   ├── user.endpoints.ts
│   ├── order.endpoints.ts
│   └── index.ts
├── modules/                # Feature modules
│   ├── user/
│   │   ├── user.module.ts
│   │   ├── user.controller.ts
│   │   ├── user.service.ts
│   │   └── user.repository.ts
│   └── order/
│       ├── order.module.ts
│       ├── order.controller.ts
│       └── order.service.ts
├── shared/                 # Shared utilities
│   ├── guards/
│   ├── decorators/
│   └── utils/
├── config/                 # Configuration
│   └── app.config.ts
├── app.module.ts          # Root module
└── main.ts                # Application entry point
```

### API Definitions

Keep all endpoint definitions in a centralized `api/` directory:

```typescript
// api/user.endpoints.ts
import { builder } from '@navios/builder'
import { z } from 'zod'

const userApi = builder()

export const getUser = userApi.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

export const createUser = userApi.declareEndpoint({
  method: 'POST',
  url: '/users',
  requestSchema: createUserSchema,
  responseSchema: userSchema,
})
```

This allows sharing endpoint definitions between server and client for full type safety.

## Module Organization

### Feature Modules

Group related functionality into feature modules:

```typescript
// Good - focused feature module
@Module({
  controllers: [UserController],
})
export class UserModule {}

// Avoid - everything in one module
@Module({
  controllers: [UserController, OrderController, ProductController, ...],
})
export class AppModule {}
```

### Shared Modules

Create modules for cross-cutting concerns:

```typescript
@Module({
  controllers: [], // Provides services only
})
export class DatabaseModule {}
```

## Key Guidelines

| Topic | Guideline | Details |
|-------|-----------|---------|
| Controllers | Keep thin, delegate to services | [Controllers guide](/docs/server/guides/controllers) |
| Services | Single responsibility | [Services guide](/docs/server/guides/services) |
| Errors | Use appropriate exception types | [Error handling](/docs/server/guides/error-handling) |
| Guards | Apply at module or endpoint level | [Guards guide](/docs/server/guides/guards) |
| Config | Use typed ConfigService | [Configuration](/docs/server/guides/configuration) |
| Logging | Include context, use correct levels | [Logging guide](/docs/server/guides/logging) |
| Testing | Unit, integration, and E2E | [Testing guide](/docs/server/guides/testing) |

## Quick Tips

**Controllers**: Delegate business logic to services. Controllers handle HTTP concerns only.

**Services**: One responsibility per service. Inject dependencies, don't instantiate them.

**Endpoints**: Always use `@navios/builder` for type-safe definitions.

**Guards**: Use module-level guards for broad protection, endpoint-level for specific routes.

**Configuration**: Use `getOrThrow` for required values, `getOrDefault` for optional.

**Logging**: Always include context: `inject(Logger, { context: 'ServiceName' })`.

**Security**: Validate all input with Zod schemas. Never log sensitive data.
