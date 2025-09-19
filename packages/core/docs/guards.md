# Guards

Guards in Navios are classes that determine whether a request should be allowed to proceed to the endpoint handler. They implement authentication, authorization, rate limiting, and other security or business logic checks.

## What are Guards?

Guards are executed before the endpoint handler and can:

- Allow or deny access to endpoints
- Perform authentication checks
- Validate user permissions
- Implement rate limiting
- Execute any custom logic before request processing

Guards receive an `AbstractExecutionContext` parameter that provides access to:

- Request and response objects via `getRequest()` and `getReply()`
- Module metadata via `getModule()`
- Controller metadata via `getController()`
- Handler/endpoint metadata via `getHandler()`
- All attributes defined on modules, controllers, and handlers

## Execution Context Interface

The `AbstractExecutionContext` interface provides the following methods:

```typescript
interface AbstractExecutionContext {
  getModule(): ModuleMetadata // Module-level metadata and attributes
  getController(): ControllerMetadata // Controller-level metadata and attributes
  getHandler(): HandlerMetadata // Handler/endpoint-level metadata and attributes
  getRequest(): any // Framework-specific request object
  getReply(): any // Framework-specific response object
}
```

## Creating Guards

### Basic Guard

```typescript
import type { AbstractExecutionContext, CanActivate } from '@navios/core'

import { Injectable } from '@navios/di'

@Injectable()
export class AuthGuard implements CanActivate {
  async canActivate(
    executionContext: AbstractExecutionContext,
  ): Promise<boolean> {
    const request = executionContext.getRequest()
    const authHeader = request.headers?.authorization

    if (!authHeader) {
      return false
    }

    // Validate token
    const token = authHeader.replace('Bearer ', '')
    return this.validateToken(token)
  }

  private async validateToken(token: string): Promise<boolean> {
    // Token validation logic
    return token === 'valid-token'
  }
}
```

### Guard with Dependencies

```typescript
import type { AbstractExecutionContext, CanActivate } from '@navios/core'

import { inject, Injectable, Logger } from '@navios/di'

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private jwtService = inject(JwtService)
  private userService = inject(UserService)
  private logger = inject(Logger, { context: 'JwtAuthGuard' })

  async canActivate(
    executionContext: AbstractExecutionContext,
  ): Promise<boolean> {
    try {
      const request = executionContext.getRequest()
      const token = this.extractTokenFromHeader(request.headers)

      if (!token) {
        this.logger.debug('No token provided')
        return false
      }

      const payload = await this.jwtService.verify(token)
      const user = await this.userService.findById(payload.sub)

      if (!user || !user.isActive) {
        this.logger.debug(`User not found or inactive: ${payload.sub}`)
        return false
      }

      // Attach user to request context
      request.user = user
      return true
    } catch (error) {
      this.logger.debug('Token validation failed', error.message)
      return false
    }
  }

  private extractTokenFromHeader(
    headers: Record<string, string>,
  ): string | null {
    const authHeader = headers?.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null
    }
    return authHeader.substring(7)
  }
}
```

## Using Guards

### Controller-Level Guards

Guards applied to controllers affect all endpoints in that controller:

```typescript
import { Controller, UseGuards } from '@navios/core'

@Controller({
  guards: [AuthGuard], // Applied to all endpoints
})
export class UserController {
  // All endpoints here require authentication
}
```

### Endpoint-Level Guards

Guards applied to specific endpoints:

```typescript
@Controller()
export class UserController {
  @Endpoint(profileEndpoint)
  async getProfile() {
    // No authentication required
  }

  @UseGuards([AuthGuard, AdminGuard])
  @Endpoint(deleteUserEndpoint)
  async deleteUser() {
    // Requires authentication AND admin role
  }
}
```

### Module-Level Guards

Guards applied to modules affect all controllers in that module:

```typescript
import { Module } from '@navios/core'

@Module({
  guards: [AuthGuard], // Applied to all controllers in module
  controllers: [UserController, PostController],
})
export class ProtectedModule {}
```

## Guard Execution Order

Guards are executed in the following order:

1. Module-level guards
2. Controller-level guards
3. Endpoint-level guards

```typescript
@Module({
  guards: [AuthGuard], // 1st
  controllers: [UserController],
})
export class AppModule {}

@Controller({
  guards: [RoleGuard], // 2nd
})
export class UserController {
  @UseGuards([OwnershipGuard]) // 3rd
  @Endpoint(deleteUserEndpoint)
  async deleteUser() {
    // Execution order: AuthGuard -> RoleGuard -> OwnershipGuard
  }
}
```

## Common Guard Patterns

### Role-Based Authorization

Use AttributeFactory to define roles required for endpoints

### Resource Ownership Guard

### Rate Limiting Guard

### API Key Guard

```typescript
import type { AbstractExecutionContext, CanActivate } from '@navios/core'

import { inject, Injectable, Logger } from '@navios/di'

@Injectable()
export class ApiKeyGuard implements CanActivate {
  private configService = inject(ConfigService)
  private logger = inject(Logger, { context: 'ApiKeyGuard' })

  async canActivate(
    executionContext: AbstractExecutionContext,
  ): Promise<boolean> {
    const request = executionContext.getRequest()
    const apiKey = request.headers?.['x-api-key']

    if (!apiKey) {
      this.logger.debug('No API key provided')
      return false
    }

    const validApiKeys = this.configService.get<string[]>('VALID_API_KEYS')
    const isValid = validApiKeys.includes(apiKey)

    if (!isValid) {
      this.logger.warn(`Invalid API key used: ${apiKey.substring(0, 8)}...`)
    }

    return isValid
  }
}

@Controller()
export class ApiController {
  @UseGuards([ApiKeyGuard])
  @Endpoint(publicDataEndpoint)
  async getPublicData() {
    // Requires valid API key
  }
}
```

## Advanced Guard Patterns

### Conditional Guards

```typescript
import type { AbstractExecutionContext, CanActivate } from '@navios/core'

import { inject, Injectable } from '@navios/di'

@Injectable()
export class ConditionalAuthGuard implements CanActivate {
  private configService = inject(ConfigService)
  private authGuard = inject(AuthGuard)

  async canActivate(
    executionContext: AbstractExecutionContext,
  ): Promise<boolean> {
    const authRequired = this.configService.get<boolean>('AUTH_REQUIRED')

    if (!authRequired) {
      return true
    }

    return this.authGuard.canActivate(executionContext)
  }
}
```

### Guards with Attributes

Guards can read attributes from the execution context using `AttributeFactory`:

```typescript
import type { AbstractExecutionContext, CanActivate } from '@navios/core'

import { AttributeFactory, inject, Injectable, Logger } from '@navios/di'

// Define attributes
const PublicSymbol = Symbol.for('Public')
export const Public = AttributeFactory.createAttribute(PublicSymbol)

const RolesSymbol = Symbol.for('Roles')
const RolesSchema = z.object({
  roles: z.array(z.string()),
})
export const Roles = AttributeFactory.createAttribute(RolesSymbol, RolesSchema)

@Injectable()
export class AuthGuard implements CanActivate {
  private logger = inject(Logger, { context: 'AuthGuard' })

  async canActivate(
    executionContext: AbstractExecutionContext,
  ): Promise<boolean> {
    // Check if endpoint is marked as public using AttributeFactory.getLast
    // This checks module, controller, and handler metadata in hierarchy order
    const isPublic = AttributeFactory.getLast(Public, [
      executionContext.getModule(),
      executionContext.getController(),
      executionContext.getHandler(),
    ])

    if (isPublic) {
      this.logger.debug('Public endpoint, skipping authentication')
      return true
    }

    // Check required roles
    const requiredRoles = AttributeFactory.getLast(Roles, [
      executionContext.getModule(),
      executionContext.getController(),
      executionContext.getHandler(),
    ])

    const request = executionContext.getRequest()
    const user = request.user

    if (!user) {
      return false
    }

    if (!requiredRoles) {
      return true // No specific roles required, just authentication
    }

    // Check if user has any of the required roles
    return requiredRoles.roles.some((role) => user.roles.includes(role))
  }
}

// Usage examples
@Controller()
export class UserController {
  @Public() // This endpoint is public
  @Endpoint(loginEndpoint)
  async login() {
    // Public endpoint
  }

  @Roles({ roles: ['admin', 'moderator'] }) // Requires admin or moderator role
  @Endpoint(deleteUserEndpoint)
  async deleteUser() {
    // Requires authentication and admin/moderator role
  }
}
```

You can also check attributes individually:

```typescript
@Injectable()
export class RoleBasedGuard implements CanActivate {
  async canActivate(
    executionContext: AbstractExecutionContext,
  ): Promise<boolean> {
    const handlerMetadata = executionContext.getHandler()
    const controllerMetadata = executionContext.getController()
    const moduleMetadata = executionContext.getModule()

    // Check if handler has specific attribute
    const handlerRoles = AttributeFactory.get(Roles, handlerMetadata)
    if (handlerRoles) {
      return this.checkRoles(handlerRoles.roles, executionContext)
    }

    // Fall back to controller-level roles
    const controllerRoles = AttributeFactory.get(Roles, controllerMetadata)
    if (controllerRoles) {
      return this.checkRoles(controllerRoles.roles, executionContext)
    }

    // Fall back to module-level roles
    const moduleRoles = AttributeFactory.get(Roles, moduleMetadata)
    if (moduleRoles) {
      return this.checkRoles(moduleRoles.roles, executionContext)
    }

    return true // No role restrictions
  }

  private checkRoles(
    requiredRoles: string[],
    executionContext: AbstractExecutionContext,
  ): boolean {
    const request = executionContext.getRequest()
    const user = request.user
    return user && requiredRoles.some((role) => user.roles.includes(role))
  }
}
```

## Error Handling in Guards

Guards should handle errors gracefully:

```typescript
import type { AbstractExecutionContext, CanActivate } from '@navios/core'

import { inject, Injectable, Logger } from '@navios/di'

@Injectable()
export class SafeAuthGuard implements CanActivate {
  private jwtService = inject(JwtService)
  private logger = inject(Logger, { context: 'SafeAuthGuard' })

  async canActivate(
    executionContext: AbstractExecutionContext,
  ): Promise<boolean> {
    try {
      const request = executionContext.getRequest()
      const token = this.extractToken(request.headers)

      if (!token) {
        return false
      }

      await this.jwtService.verify(token)
      return true
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        this.logger.debug('Token expired')
      } else if (error.name === 'JsonWebTokenError') {
        this.logger.debug('Invalid token')
      } else {
        this.logger.error('Unexpected error in auth guard', error.stack)
      }

      return false
    }
  }

  private extractToken(headers: Record<string, string>): string | null {
    const authHeader = headers?.authorization
    return authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null
  }
}
```

## Best Practices

### 1. Keep Guards Focused

Each guard should have a single responsibility:

```typescript
// ✅ Good - Single responsibility
@Injectable()
export class AuthenticationGuard {
  async canActivate(context: GuardContext): Promise<boolean> {
    // Only handles authentication
  }
}

@Injectable()
export class AuthorizationGuard {
  async canActivate(context: GuardContext): Promise<boolean> {
    // Only handles authorization
  }
}

// ❌ Avoid - Multiple responsibilities
@Injectable()
export class AuthGuard {
  async canActivate(context: GuardContext): Promise<boolean> {
    // Handles both authentication AND authorization
  }
}
```

### 2. Fail Securely

When in doubt, deny access:

```typescript
@Injectable()
export class SecureGuard {
  async canActivate(context: GuardContext): Promise<boolean> {
    try {
      // Validation logic
      return this.validateAccess(context)
    } catch (error) {
      // Fail securely - deny access on errors
      this.logger.error('Guard validation failed', error.stack)
      return false
    }
  }
}
```

### 3. Use Dependency Injection

Inject services rather than creating instances:

```typescript
// ✅ Good - Use DI
@Injectable()
export class AuthGuard implements CanActivate {
  private jwtService = inject(JwtService)
  private userService = inject(UserService)
}

// ❌ Avoid - Direct instantiation
@Injectable()
export class AuthGuard implements CanActivate {
  private jwtService = new JwtService()
  private userService = new UserService()
}
```

### 4. Log Security Events

Log important security events for monitoring:

```typescript
@Injectable()
export class AuthGuard implements CanActivate {
  private logger = inject(Logger, { context: 'AuthGuard' })

  async canActivate(
    executionContext: AbstractExecutionContext,
  ): Promise<boolean> {
    const request = executionContext.getRequest()
    const result = await this.validateToken(request.headers?.authorization)

    if (!result) {
      this.logger.warn('Authentication failed', {
        ip: request.ip,
        userAgent: request.headers?.['user-agent'],
      })
    }

    return result
  }
}
```
