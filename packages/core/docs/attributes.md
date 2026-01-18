# Attribute System

Navios provides a powerful attribute system that allows you to attach metadata to classes and methods. Attributes are similar to annotations or decorators in other frameworks and provide a flexible way to extend functionality.

## What are Attributes?

Attributes are metadata that can be attached to classes, methods, or other elements in your application. They are created using the `AttributeFactory` and can store typed data that can be retrieved and used by your application logic.

## Creating Attributes

### Basic Attribute

```typescript
import { AttributeFactory } from '@navios/core'

// Create a simple attribute without data
export const Deprecated = AttributeFactory.createAttribute(Symbol('Deprecated'))

// Usage
@Deprecated()
export class OldController {
  @Deprecated()
  async oldMethod() {
    // This method is marked as deprecated
  }
}
```

### Schema-Based Attribute

```typescript
import { AttributeFactory } from '@navios/core'

import { z } from 'zod'

// Create an attribute with a Zod schema for validation
const CacheOptionsSchema = z.object({
  ttl: z.number().min(0),
  key: z.string().optional(),
  tags: z.array(z.string()).optional(),
})

export const Cache = AttributeFactory.createAttribute(Symbol('Cache'), CacheOptionsSchema)

// Usage with typed data
@Controller()
export class UserController {
  @Cache({ ttl: 300, key: 'user-list', tags: ['users'] })
  @Endpoint(userListEndpoint)
  async getUsers() {
    // This endpoint will be cached for 5 minutes
    return this.userService.findAll()
  }
}
```

## Attribute Types

### Class Attributes

Attributes that can be applied to classes:

```typescript
const RoleSchema = z.object({
  roles: z.array(z.string()),
  requireAll: z.boolean().default(false),
})

export const RequireRoles = AttributeFactory.createAttribute(Symbol('RequireRoles'), RoleSchema)

@RequireRoles({ roles: ['admin', 'moderator'] })
@Controller()
export class AdminController {
  // All methods in this controller require admin or moderator role
}
```

### Method Attributes

Attributes that can be applied to methods:

```typescript
const RateLimitSchema = z.object({
  requests: z.number().min(1),
  windowMs: z.number().min(1000),
  message: z.string().optional(),
})

export const RateLimit = AttributeFactory.createAttribute(Symbol('RateLimit'), RateLimitSchema)

@Controller()
export class ApiController {
  @RateLimit({ requests: 100, windowMs: 60000 })
  @Endpoint(dataEndpoint)
  async createData() {
    // Limited to 100 requests per minute
  }
}
```

## Reading Attributes

### AttributeFactory Methods

The `AttributeFactory` provides several methods for reading attributes:

```typescript
import { AttributeFactory } from '@navios/core'

// Get attribute value from a single metadata object
AttributeFactory.get(attribute, metadata)
// Returns: attribute value or null if not found

// Check if attribute exists on metadata object
AttributeFactory.has(attribute, metadata)
// Returns: boolean

// Get all instances of an attribute from metadata object
AttributeFactory.getAll(attribute, metadata)
// Returns: array of values or null if none found

// Get the last/most specific attribute from an array of metadata objects
// Searches from right to left (most specific to least specific)
AttributeFactory.getLast(attribute, [moduleMetadata, controllerMetadata, handlerMetadata])
// Returns: attribute value from the most specific level or null
```

### Reading Attributes from Metadata

You can read attributes from metadata objects using `AttributeFactory`:

```typescript
import { AttributeFactory } from '@navios/core'

@Module({
  controllers: [UserController],
})
@RequireRoles({ roles: ['admin'] })
export class AdminModule {}

// Reading from metadata objects directly
const moduleMetadata = extractModuleMetadata(AdminModule)
const roleRequirement = AttributeFactory.get(RequireRoles, moduleMetadata)
// roleRequirement = { roles: ['admin'], requireAll: false }
```

### Reading from Controller Metadata

```typescript
import { AttributeFactory, extractControllerMetadata } from '@navios/core'

@Cache({ ttl: 600 })
@Controller()
export class UserController {}

// Read the attribute
const metadata = extractControllerMetadata(UserController)
const cacheConfig = AttributeFactory.get(Cache, metadata)
// cacheConfig = { ttl: 600 }
```

### Reading from Execution Context

The most common way to read attributes is from the execution context in guards, interceptors, or middleware:

```typescript
import type { AbstractExecutionContext } from '@navios/core'

import { AttributeFactory } from '@navios/core'

@Controller()
export class UserController {
  @RateLimit({ requests: 10, windowMs: 60000 })
  @Endpoint(createUserEndpoint)
  async createUser() {}
}

// Reading attributes in a guard or interceptor
function readAttributesFromContext(executionContext: AbstractExecutionContext) {
  const handlerMetadata = executionContext.getHandler()
  const controllerMetadata = executionContext.getController()
  const moduleMetadata = executionContext.getModule()

  // Read from specific metadata
  const rateLimitConfig = AttributeFactory.get(RateLimit, handlerMetadata)
  // rateLimitConfig = { requests: 10, windowMs: 60000 }

  // Check if attribute exists
  const hasRateLimit = AttributeFactory.has(RateLimit, handlerMetadata)

  // Get attribute value from hierarchy (handler -> controller -> module)
  const authRequired = AttributeFactory.getLast(RequireAuth, [
    moduleMetadata,
    controllerMetadata,
    handlerMetadata,
  ])
}
```

## Common Attribute Patterns

### Authorization Attributes

```typescript
const PermissionSchema = z.object({
  resource: z.string(),
  action: z.string(),
  ownership: z.boolean().default(false),
})

export const RequirePermission = AttributeFactory.createAttribute(
  Symbol('RequirePermission'),
  PermissionSchema,
)

@Controller()
export class PostController {
  @RequirePermission({
    resource: 'post',
    action: 'delete',
    ownership: true,
  })
  @Endpoint(deletePostEndpoint)
  async deletePost({ params }: { params: { id: string } }) {
    // User must have delete permission on posts and own the post
    return this.postService.delete(params.id)
  }
}
```

### Validation Attributes

```typescript
const ValidateParamsSchema = z.object({
  schema: z.any(), // ZodSchema
  transform: z.boolean().default(false),
})

export const ValidateParams = AttributeFactory.createAttribute(
  Symbol('ValidateParams'),
  ValidateParamsSchema,
)

const UuidParamsSchema = z.object({
  id: z.string().uuid(),
})

@Controller()
export class UserController {
  @ValidateParams({ schema: UuidParamsSchema, transform: true })
  @Endpoint(byIdEndpoint)
  async getUserById({ params }: { params: { id: string } }) {
    // params.id is validated as UUID
    return this.userService.findById(params.id)
  }
}
```

### Logging Attributes

```typescript
const LogSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']),
  message: z.string().optional(),
  includeRequest: z.boolean().default(false),
  includeResponse: z.boolean().default(false),
})

export const Log = AttributeFactory.createAttribute(Symbol('Log'), LogSchema)

@Controller()
export class UserController {
  @Log({
    level: 'info',
    message: 'User login attempt',
    includeRequest: true,
  })
  @Endpoint(loginEndpoint)
  async login({ body }: { body: LoginDto }) {
    // Login attempts are logged with request details
    return this.authService.login(body)
  }
}
```

### Caching Attributes

```typescript
const CacheSchema = z.object({
  ttl: z.number().min(0),
  key: z.string().optional(),
  tags: z.array(z.string()).default([]),
  invalidateOn: z.array(z.string()).optional(),
})

export const Cache = AttributeFactory.createAttribute(Symbol('Cache'), CacheSchema)

@Controller()
export class UserController {
  @Cache({
    ttl: 300,
    key: 'user-{id}',
    tags: ['users'],
    invalidateOn: ['user-updated', 'user-deleted'],
  })
  @Endpoint(getUserByIdEndpoint)
  async getUserById({ params }: { params: { id: string } }) {
    // Response cached for 5 minutes with dynamic key
    return this.userService.findById(params.id)
  }
}
```

## Practical Examples

### Using AttributeFactory.getLast for Hierarchical Configuration

`AttributeFactory.getLast` is particularly useful when you want to support attribute inheritance from module → controller → handler levels:

```typescript
import type { AbstractExecutionContext, CanActivate } from '@navios/core'

import { AttributeFactory, inject, Injectable, Logger } from '@navios/di'

// Define a Public attribute that can skip authentication
const PublicSymbol = Symbol.for('Public')
export const Public = AttributeFactory.createAttribute(PublicSymbol)

// Define roles attribute with schema validation
const RolesSchema = z.object({
  roles: z.array(z.enum(['VIEWER', 'USER', 'ADMIN', 'OWNER'])),
})
export const Roles = AttributeFactory.createAttribute(Symbol.for('Roles'), RolesSchema)

@Injectable()
export class SmartAuthGuard implements CanActivate {
  private logger = inject(Logger, { context: 'SmartAuthGuard' })

  async canActivate(executionContext: AbstractExecutionContext): Promise<boolean> {
    // Check if endpoint is public (searches handler -> controller -> module)
    const isPublic = AttributeFactory.getLast(Public, [
      executionContext.getModule(),
      executionContext.getController(),
      executionContext.getHandler(),
    ])

    if (isPublic) {
      this.logger.debug('Public endpoint, allowing access')
      return true
    }

    // Get required roles with inheritance
    const roleConfig = AttributeFactory.getLast(Roles, [
      executionContext.getModule(),
      executionContext.getController(),
      executionContext.getHandler(),
    ])

    const request = executionContext.getRequest()
    const user = request.user

    if (!user) {
      return false // Not authenticated
    }

    if (!roleConfig) {
      return true // Authenticated but no specific role requirements
    }

    // Check if user has required roles
    return roleConfig.roles.some((role) => user.roles.includes(role))
  }
}

// Usage - attributes are inherited hierarchically
@Roles({ roles: ['USER'] }) // Default: all endpoints require USER role
@Module({
  controllers: [UserController],
  guards: [SmartAuthGuard],
})
export class UserModule {}

@Roles({ roles: ['ADMIN'] }) // Override: all endpoints in this controller require ADMIN
@Controller()
export class UserController {
  @Public() // Override: this specific endpoint is public
  @Endpoint(healthCheckEndpoint)
  async healthCheck() {
    return { status: 'ok' }
  }

  @Endpoint(getUsersEndpoint)
  async getUsers() {
    // Inherits ADMIN requirement from controller
  }

  @Roles({ roles: ['OWNER'] }) // Override: this endpoint requires OWNER role
  @Endpoint(deleteUserEndpoint)
  async deleteUser() {
    // Most specific: requires OWNER role
  }
}
```

### Reading Multiple Attributes

```typescript
@Injectable()
export class ConfigurableGuard implements CanActivate {
  async canActivate(executionContext: AbstractExecutionContext): Promise<boolean> {
    const handler = executionContext.getHandler()
    const controller = executionContext.getController()
    const module = executionContext.getModule()

    // Check multiple attributes at handler level
    const isPublic = AttributeFactory.get(Public, handler)
    const requiredRoles = AttributeFactory.get(Roles, handler)
    const cacheConfig = AttributeFactory.get(Cache, handler)

    // Use getLast for fallback chain
    const authConfig = AttributeFactory.getLast(AuthConfig, [module, controller, handler])

    // Implement your logic based on multiple attributes
    if (isPublic) return true
    if (authConfig?.disabled) return true

    // Continue with role checking...
    return this.checkRoles(requiredRoles, executionContext)
  }
}
```

## Implementing Attribute Handlers

### Creating Middleware for Attributes

```typescript
import type { AbstractExecutionContext } from '@navios/core'

import { AttributeFactory, inject, Injectable, Logger } from '@navios/di'

@Injectable()
export class CacheMiddleware {
  private cacheService = inject(CacheService)
  private logger = inject(Logger, { context: 'CacheMiddleware' })

  async handle(executionContext: AbstractExecutionContext, next: Function) {
    // Read cache configuration from attributes
    const cacheConfig = AttributeFactory.getLast(Cache, [
      executionContext.getModule(),
      executionContext.getController(),
      executionContext.getHandler(),
    ])

    if (!cacheConfig) {
      return next()
    }

    const request = executionContext.getRequest()

    // Generate cache key
    const key = this.generateCacheKey(cacheConfig.key, request)

    // Try to get from cache
    const cached = await this.cacheService.get(key)
    if (cached) {
      this.logger.debug(`Cache hit for key: ${key}`)
      return cached
    }

    // Execute endpoint
    const result = await next()

    // Store in cache
    await this.cacheService.set(key, result, cacheConfig.ttl)
    this.logger.debug(`Cached result for key: ${key}`)

    return result
  }

  private generateCacheKey(template: string, request: any): string {
    return template.replace(/{(\w+)}/g, (match, param) => {
      return request.params[param] || match
    })
  }
}
```

### Using Attributes in Guards

```typescript
import type { AbstractExecutionContext, CanActivate } from '@navios/core'

import { AttributeFactory, inject, Injectable } from '@navios/di'

@Injectable()
export class RoleGuard implements CanActivate {
  private authService = inject(AuthService)

  async canActivate(executionContext: AbstractExecutionContext): Promise<boolean> {
    // Use getLast to get the most specific role requirement
    const requiredRoles = AttributeFactory.getLast(RequireRoles, [
      executionContext.getModule(),
      executionContext.getController(),
      executionContext.getHandler(),
    ])

    if (!requiredRoles) {
      return true // No role requirement
    }

    const request = executionContext.getRequest()
    const user = await this.authService.getCurrentUser(request)
    if (!user) {
      return false
    }

    // Check if user has required roles
    const hasRequiredRole = requiredRoles.requireAll
      ? requiredRoles.roles.every((role) => user.roles.includes(role))
      : requiredRoles.roles.some((role) => user.roles.includes(role))

    return hasRequiredRole
  }
}
```

## Advanced Attribute Usage

### Composable Attributes

```typescript
// Create multiple attributes that work together
export const Authenticated = AttributeFactory.createAttribute(Symbol('Authenticated'))

export const RequireOwnership = AttributeFactory.createAttribute(
  Symbol('RequireOwnership'),
  z.object({
    resourceParam: z.string().default('id'),
    userProperty: z.string().default('userId'),
  }),
)

@Controller()
export class PostController {
  @Authenticated()
  @RequireOwnership({ resourceParam: 'id', userProperty: 'authorId' })
  @Endpoint(updatePostEndpoint)
  async updatePost({ params, body }: { params: { id: string }; body: UpdatePostDto }) {
    // User must be authenticated and own the post
    return this.postService.update(params.id, body)
  }
}
```

### Dynamic Attributes

```typescript
const ConditionalCacheSchema = z.object({
  condition: z.function().args(z.any()).returns(z.boolean()),
  ttl: z.number(),
  key: z.string(),
})

export const ConditionalCache = AttributeFactory.createAttribute(
  Symbol('ConditionalCache'),
  ConditionalCacheSchema,
)

@Controller()
export class UserController {
  @ConditionalCache({
    condition: (request) => request.user?.isPremium === true,
    ttl: 3600,
    key: 'premium-user-{id}',
  })
  @Endpoint(getPremiumDataEndpoint)
  async getPremiumData({ params }: { params: { id: string } }) {
    // Only cache for premium users
    return this.userService.getPremiumData(params.id)
  }
}
```

## Best Practices

### 1. Use Descriptive Names

```typescript
// ✅ Good - Clear intent
export const RequireAdminRole = AttributeFactory.createAttribute(Symbol('RequireAdminRole'))

// ❌ Avoid - Unclear purpose
export const Admin = AttributeFactory.createAttribute(Symbol('Admin'))
```

### 2. Validate Attribute Data

```typescript
// ✅ Good - Use schemas for validation
const RateLimitSchema = z.object({
  requests: z.number().min(1),
  windowMs: z.number().min(1000),
})

export const RateLimit = AttributeFactory.createAttribute(Symbol('RateLimit'), RateLimitSchema)
```

### 3. Document Attribute Behavior

```typescript
/**
 * Caches the endpoint response for the specified duration.
 *
 * @param ttl - Time to live in seconds
 * @param key - Cache key template (supports {param} placeholders)
 * @param tags - Cache tags for invalidation
 */
export const Cache = AttributeFactory.createAttribute(Symbol('Cache'), CacheSchema)
```

### 4. Keep Attributes Focused

```typescript
// ✅ Good - Single responsibility
export const RateLimit = AttributeFactory.createAttribute(Symbol('RateLimit'), RateLimitSchema)

export const Cache = AttributeFactory.createAttribute(Symbol('Cache'), CacheSchema)

// ❌ Avoid - Multiple responsibilities
export const RateLimitAndCache = AttributeFactory.createAttribute(
  Symbol('RateLimitAndCache'),
  z.object({
    rateLimit: RateLimitSchema,
    cache: CacheSchema,
  }),
)
```
