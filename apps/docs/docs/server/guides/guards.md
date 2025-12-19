---
sidebar_position: 4
title: Guards
---

# Guards

Guards implement authorization logic that runs before endpoint handlers. They control access to your API endpoints.

## What are Guards?

Guards are classes that implement the `CanActivate` interface. They receive the execution context and return a boolean indicating whether the request should proceed.

**Key characteristics:**

- Run before the endpoint handler executes
- Can access request data (headers, params, body)
- Return `true` to allow access, `false` to deny
- Can throw exceptions for specific error responses
- Can attach data to the request for use in handlers

## Creating a Guard

Implement the `CanActivate` interface:

```typescript
import { Injectable, CanActivate, AbstractExecutionContext } from '@navios/core'

@Injectable()
class AuthGuard implements CanActivate {
  async canActivate(context: AbstractExecutionContext): Promise<boolean> {
    const request = context.getRequest()
    const token = request.headers.authorization

    if (!token) {
      return false // Returns 403 Forbidden
    }

    return true
  }
}
```

## Applying Guards

### Module-Level Guards

Apply guards to all endpoints in a module:

```typescript
@Module({
  controllers: [UserController, ProfileController],
  guards: [AuthGuard],
})
class UserModule {}
```

### Endpoint-Level Guards

Apply guards to specific endpoints using `@UseGuards()`:

```typescript
import { UseGuards } from '@navios/core'

@Controller()
class UserController {
  @Endpoint(getUser)
  async getUser(params: EndpointParams<typeof getUser>) {
    // Public endpoint - no guard
  }

  @Endpoint(deleteUser)
  @UseGuards(AdminGuard)
  async deleteUser(params: EndpointParams<typeof deleteUser>) {
    // Protected by AdminGuard
  }
}
```

### Multiple Guards

Apply multiple guards - all must pass:

```typescript
@Module({
  controllers: [AdminController],
  guards: [AuthGuard, AdminGuard],
})
class AdminModule {}

// Or on endpoint
@Endpoint(sensitiveAction)
@UseGuards(AuthGuard, AdminGuard)
async sensitiveAction() {}
```

## Guard Execution Order

1. Module guards run first (in array order)
2. Endpoint guards run second (in array order)
3. If any guard returns `false` or throws, the request is rejected

## Accessing Request Data

Use the execution context to access request information:

```typescript
@Injectable()
class AuthGuard implements CanActivate {
  async canActivate(context: AbstractExecutionContext): Promise<boolean> {
    const request = context.getRequest()

    // Access headers
    const authHeader = request.headers.authorization

    // Access URL parameters
    const userId = request.params.userId

    // Access query parameters
    const token = request.query.token

    // Access body
    const body = request.body

    return true
  }
}
```

## Throwing Exceptions

Throw HTTP exceptions for specific error responses:

```typescript
import { UnauthorizedException, ForbiddenException } from '@navios/core'

@Injectable()
class AuthGuard implements CanActivate {
  async canActivate(context: AbstractExecutionContext): Promise<boolean> {
    const request = context.getRequest()
    const authHeader = request.headers.authorization

    if (!authHeader) {
      throw new UnauthorizedException('Missing authorization header')
    }

    if (!authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Invalid authorization format')
    }

    return true
  }
}
```

## Attaching Data to Request

Guards often attach data for use in handlers:

```typescript
@Injectable()
class AuthGuard implements CanActivate {
  private userService = inject(UserService)

  async canActivate(context: AbstractExecutionContext): Promise<boolean> {
    const request = context.getRequest()
    const userId = this.extractUserId(request)

    if (!userId) {
      throw new UnauthorizedException()
    }

    const user = await this.userService.findById(userId)
    if (!user) {
      throw new UnauthorizedException('User not found')
    }

    // Attach user to request
    request.user = user
    return true
  }
}
```

Access in controller:

```typescript
@Controller()
class ProfileController {
  @Endpoint(getProfile)
  async getProfile(params: EndpointParams<typeof getProfile>) {
    const request = inject(Request)
    return request.user // User attached by guard
  }
}
```

## Common Guard Patterns

### Simple Token Check

```typescript
@Injectable()
class ApiKeyGuard implements CanActivate {
  private config = inject(ConfigService)

  async canActivate(context: AbstractExecutionContext): Promise<boolean> {
    const request = context.getRequest()
    const apiKey = request.headers['x-api-key']
    const validKey = this.config.getOrThrow('API_KEY')

    if (apiKey !== validKey) {
      throw new UnauthorizedException('Invalid API key')
    }

    return true
  }
}
```

### Role Check

```typescript
@Injectable()
class AdminGuard implements CanActivate {
  async canActivate(context: AbstractExecutionContext): Promise<boolean> {
    const request = context.getRequest()
    const user = request.user // Set by AuthGuard

    if (!user || user.role !== 'admin') {
      throw new ForbiddenException('Admin access required')
    }

    return true
  }
}
```

## Next Steps

For complete authentication implementations with JWT tokens, database user lookup, and refresh tokens, see the [Authentication recipe](/docs/server/recipes/authentication).
