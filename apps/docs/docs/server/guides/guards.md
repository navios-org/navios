---
sidebar_position: 3
title: Guards & Authentication
---

# Guards & Authentication

Guards implement authorization logic that runs before endpoint handlers. They control access to your API endpoints.

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
      return false
    }

    // Verify token and allow/deny access
    return true
  }
}
```

## Applying Guards

### Module-Level Guards

Apply guards to all endpoints in a module:

```typescript
@Module({
  controllers: [UserController],
  guards: [AuthGuard],
})
class UserModule {}
```

### Endpoint-Level Guards

Apply guards to specific endpoints:

```typescript
import { UseGuards } from '@navios/core'

@Controller()
class UserController {
  @Endpoint(getUser)
  async getUser(params: EndpointParams<typeof getUser>) {
    // Public endpoint
  }

  @Endpoint(deleteUser)
  @UseGuards(AdminGuard)
  async deleteUser(params: EndpointParams<typeof deleteUser>) {
    // Admin only
  }
}
```

### Multiple Guards

Apply multiple guards (all must pass):

```typescript
@Module({
  controllers: [AdminController],
  guards: [AuthGuard, AdminGuard, RateLimitGuard],
})
class AdminModule {}

// Or on endpoint
@Endpoint(sensitiveAction)
@UseGuards(AuthGuard, AdminGuard, AuditGuard)
async sensitiveAction() {}
```

## Guard Execution Order

1. Module guards run first (in array order)
2. Endpoint guards run second (in array order)
3. If any guard returns `false` or throws, the request is rejected

## Accessing Request Data

Use the execution context to access request data:

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

Throw HTTP exceptions to return specific error responses:

```typescript
import { UnauthorizedException, ForbiddenException } from '@navios/core'

@Injectable()
class AuthGuard implements CanActivate {
  private jwtService = inject(JwtService)

  async canActivate(context: AbstractExecutionContext): Promise<boolean> {
    const request = context.getRequest()
    const authHeader = request.headers.authorization

    if (!authHeader) {
      throw new UnauthorizedException('Missing authorization header')
    }

    if (!authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Invalid authorization format')
    }

    try {
      const token = authHeader.slice(7)
      const payload = await this.jwtService.verifyAsync(token)
      request.user = payload
      return true
    } catch {
      throw new UnauthorizedException('Invalid or expired token')
    }
  }
}
```

## Attaching Data to Request

Guards often attach data for use in handlers:

```typescript
@Injectable()
class AuthGuard implements CanActivate {
  private userService = inject(UserService)
  private jwtService = inject(JwtService)

  async canActivate(context: AbstractExecutionContext): Promise<boolean> {
    const request = context.getRequest()
    const token = request.headers.authorization?.slice(7)

    if (!token) {
      throw new UnauthorizedException()
    }

    const payload = await this.jwtService.verifyAsync<{ sub: string }>(token)
    const user = await this.userService.findById(payload.sub)

    if (!user) {
      throw new UnauthorizedException('User not found')
    }

    // Attach user to request for use in handlers
    request.user = user
    return true
  }
}

// Access in controller
@Controller()
class UserController {
  @Endpoint(getProfile)
  async getProfile(params: EndpointParams<typeof getProfile>) {
    const request = inject(Request)
    return request.user // User attached by guard
  }
}
```

## Role-Based Access Control

Example of a role-based guard:

```typescript
@Injectable()
class RoleGuard implements CanActivate {
  constructor(private allowedRoles: string[]) {}

  async canActivate(context: AbstractExecutionContext): Promise<boolean> {
    const request = context.getRequest()
    const user = request.user

    if (!user) {
      throw new UnauthorizedException()
    }

    if (!this.allowedRoles.includes(user.role)) {
      throw new ForbiddenException('Insufficient permissions')
    }

    return true
  }
}

// Usage with factory function
function Roles(...roles: string[]) {
  return UseGuards(new RoleGuard(roles))
}

@Controller()
class AdminController {
  @Endpoint(manageUsers)
  @Roles('admin', 'superadmin')
  async manageUsers() {}
}
```

## Rate Limiting Guard

Example rate limiting implementation:

```typescript
@Injectable()
class RateLimitGuard implements CanActivate {
  private requests = new Map<string, { count: number; resetAt: number }>()

  async canActivate(context: AbstractExecutionContext): Promise<boolean> {
    const request = context.getRequest()
    const ip = request.ip
    const now = Date.now()

    const record = this.requests.get(ip)

    if (!record || now > record.resetAt) {
      this.requests.set(ip, { count: 1, resetAt: now + 60000 })
      return true
    }

    if (record.count >= 100) {
      throw new HttpException(429, 'Too many requests')
    }

    record.count++
    return true
  }
}
```
