---
sidebar_position: 1
title: Custom Attributes
---

# Custom Attributes

Attributes are custom decorators that attach metadata to controllers or endpoints. They enable cross-cutting concerns like caching, rate limiting, feature flags, and more.

## Creating Attributes

Use `AttributeFactory` to create type-safe attributes:

```typescript
import { AttributeFactory } from '@navios/core'
import { z } from 'zod'

// Define attribute with schema
const RateLimit = AttributeFactory('RateLimit', z.object({
  requests: z.number(),
  window: z.number(), // seconds
}))

// Use on controller or endpoint
@Controller()
@RateLimit({ requests: 100, window: 60 })
class ApiController {
  @Endpoint(getData)
  @RateLimit({ requests: 10, window: 60 })
  async getData() {}
}
```

## Attribute Types

### ClassAttribute

Apply to entire controllers:

```typescript
import { ClassAttribute } from '@navios/core'
import { z } from 'zod'

const ApiVersion = ClassAttribute('ApiVersion', z.object({
  version: z.string(),
  deprecated: z.boolean().default(false),
}))

@Controller()
@ApiVersion({ version: '2.0' })
class UserController {}
```

### ClassSchemaAttribute

Attributes with Zod schema validation:

```typescript
import { ClassSchemaAttribute } from '@navios/core'
import { z } from 'zod'

const Cache = ClassSchemaAttribute('Cache', z.object({
  ttl: z.number().min(0),
  key: z.string().optional(),
  invalidateOn: z.array(z.string()).optional(),
}))

@Controller()
class ProductController {
  @Endpoint(getProduct)
  @Cache({ ttl: 3600, key: 'product:$productId' })
  async getProduct(params: EndpointParams<typeof getProduct>) {}
}
```

## Reading Attributes

Access attribute values in guards or middleware:

```typescript
import { Injectable, CanActivate, AbstractExecutionContext } from '@navios/core'

@Injectable()
class RateLimitGuard implements CanActivate {
  async canActivate(context: AbstractExecutionContext): Promise<boolean> {
    // Get attribute metadata from controller or endpoint
    const rateLimitConfig = context.getMetadata('RateLimit')

    if (!rateLimitConfig) {
      return true // No rate limit defined
    }

    const { requests, window } = rateLimitConfig
    // Implement rate limiting logic...

    return true
  }
}
```

## Practical Examples

### Feature Flags

```typescript
const FeatureFlag = AttributeFactory('FeatureFlag', z.object({
  flag: z.string(),
  fallback: z.boolean().default(false),
}))

@Controller()
class ExperimentalController {
  @Endpoint(newFeature)
  @FeatureFlag({ flag: 'new-dashboard', fallback: false })
  async newFeature() {}
}

// Guard implementation
@Injectable()
class FeatureFlagGuard implements CanActivate {
  private featureService = inject(FeatureService)

  async canActivate(context: AbstractExecutionContext): Promise<boolean> {
    const config = context.getMetadata('FeatureFlag')
    if (!config) return true

    const enabled = await this.featureService.isEnabled(config.flag)
    if (!enabled && !config.fallback) {
      throw new NotFoundException('Feature not available')
    }

    return enabled || config.fallback
  }
}
```

### Audit Logging

```typescript
const AuditLog = AttributeFactory('AuditLog', z.object({
  action: z.string(),
  resource: z.string(),
}))

@Controller()
class AdminController {
  @Endpoint(deleteUser)
  @AuditLog({ action: 'DELETE', resource: 'user' })
  async deleteUser(params: EndpointParams<typeof deleteUser>) {}
}

// Middleware to log actions
@Injectable()
class AuditMiddleware implements CanActivate {
  private auditService = inject(AuditService)

  async canActivate(context: AbstractExecutionContext): Promise<boolean> {
    const config = context.getMetadata('AuditLog')
    if (!config) return true

    const request = context.getRequest()
    await this.auditService.log({
      action: config.action,
      resource: config.resource,
      userId: request.user?.id,
      timestamp: new Date(),
    })

    return true
  }
}
```

### Response Caching

```typescript
const Cacheable = AttributeFactory('Cacheable', z.object({
  ttl: z.number(),
  key: z.string(),
}))

@Controller()
class ProductController {
  @Endpoint(getProduct)
  @Cacheable({ ttl: 300, key: 'product:$productId' })
  async getProduct(params: EndpointParams<typeof getProduct>) {}
}
```

### Role Requirements

```typescript
const RequireRoles = AttributeFactory('RequireRoles', z.object({
  roles: z.array(z.string()),
  mode: z.enum(['any', 'all']).default('any'),
}))

@Controller()
class AdminController {
  @Endpoint(manageUsers)
  @RequireRoles({ roles: ['admin', 'superadmin'], mode: 'any' })
  async manageUsers() {}

  @Endpoint(systemSettings)
  @RequireRoles({ roles: ['admin', 'ops'], mode: 'all' })
  async systemSettings() {}
}
```

## Combining Attributes

Stack multiple attributes on a single endpoint:

```typescript
@Controller()
@ApiVersion({ version: '2.0' })
class OrderController {
  @Endpoint(createOrder)
  @RateLimit({ requests: 10, window: 60 })
  @AuditLog({ action: 'CREATE', resource: 'order' })
  @RequireRoles({ roles: ['user'] })
  async createOrder(params: EndpointParams<typeof createOrder>) {}
}
```

## Attribute Inheritance

Controller-level attributes apply to all endpoints, but endpoint attributes can override:

```typescript
@Controller()
@RateLimit({ requests: 100, window: 60 }) // Default for all endpoints
class ApiController {
  @Endpoint(publicData)
  // Uses controller rate limit: 100/60s
  async publicData() {}

  @Endpoint(sensitiveData)
  @RateLimit({ requests: 10, window: 60 }) // Override
  async sensitiveData() {}
}
```
