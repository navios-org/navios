---
sidebar_position: 2
title: JWT Authentication
---

# JWT Authentication

Complete JWT-based authentication implementation with user registration, login, token refresh, and role-based access control.

> **Note:** This recipe demonstrates JWT authentication specifically. For an overview of authentication strategies (JWT, OAuth, Passport, sessions, etc.), see the [Authentication guide](/docs/server/guides/authentication).

## Overview

This recipe provides a production-ready JWT authentication implementation:

- JWT-based authentication with `@navios/jwt`
- User registration and login endpoints
- Auth guard with database user verification
- Role-based access control
- Refresh token pattern

## Setup

Install the required packages:

```bash
npm install @navios/jwt bcrypt
npm install --save-dev @types/bcrypt
```

## Project Structure

```
src/
├── config/
│   └── auth.config.ts
├── api/
│   └── auth.endpoints.ts
└── modules/
    └── auth/
        ├── auth.module.ts
        ├── auth.controller.ts
        ├── auth.service.ts
        ├── auth.guard.ts
        ├── roles.attribute.ts
        └── roles.guard.ts
```

## Configuration

Create a configuration token using `provideConfig()`:

```typescript
// config/auth.config.ts
import { provideConfig } from '@navios/core'

export interface AuthConfig {
  jwt: {
    secret: string
    expiresIn: string
    refreshSecret: string
    refreshExpiresIn: string
  }
}

export const AuthConfigService = provideConfig<AuthConfig>({
  load: () => ({
    jwt: {
      secret: process.env.JWT_SECRET || 'your-secret-key',
      expiresIn: '15m',
      refreshSecret: process.env.JWT_REFRESH_SECRET || 'your-refresh-secret',
      refreshExpiresIn: '7d',
    },
  }),
})
```

## Endpoint Definitions

```typescript
// api/auth.endpoints.ts
import { builder } from '@navios/builder'

import { z } from 'zod'

const authApi = builder()

export const registerEndpoint = authApi.declareEndpoint({
  method: 'POST',
  url: '/auth/register',
  requestSchema: z.object({
    email: z.string().email(),
    password: z.string().min(8),
    name: z.string().min(1),
  }),
  responseSchema: z.object({
    id: z.string(),
    email: z.string(),
    name: z.string(),
  }),
})

export const loginEndpoint = authApi.declareEndpoint({
  method: 'POST',
  url: '/auth/login',
  requestSchema: z.object({
    email: z.string().email(),
    password: z.string(),
  }),
  responseSchema: z.object({
    accessToken: z.string(),
    refreshToken: z.string(),
    user: z.object({
      id: z.string(),
      email: z.string(),
      name: z.string(),
      role: z.string(),
    }),
  }),
})

export const refreshEndpoint = authApi.declareEndpoint({
  method: 'POST',
  url: '/auth/refresh',
  requestSchema: z.object({
    refreshToken: z.string(),
  }),
  responseSchema: z.object({
    accessToken: z.string(),
    refreshToken: z.string(),
  }),
})

export const profileEndpoint = authApi.declareEndpoint({
  method: 'GET',
  url: '/auth/profile',
  responseSchema: z.object({
    id: z.string(),
    email: z.string(),
    name: z.string(),
    role: z.string(),
  }),
})
```

## Auth Service

```typescript
// modules/auth/auth.service.ts
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@navios/core'
import { inject } from '@navios/di'
import { JwtService } from '@navios/jwt'

import * as bcrypt from 'bcrypt'

import { AuthConfigService } from '../../config/auth.config'
import { DatabaseService } from '../database/database.service'

interface JwtPayload {
  sub: string
  email: string
  role: string
}

@Injectable()
export class AuthService {
  private db = inject(DatabaseService)
  private jwt = inject(JwtService)
  private config = inject(AuthConfigService)

  async register(email: string, password: string, name: string) {
    const existing = await this.db.users.findUnique({ where: { email } })
    if (existing) {
      throw new ConflictException('Email already registered')
    }

    const hashedPassword = await bcrypt.hash(password, 10)
    const user = await this.db.users.create({
      data: {
        email,
        password: hashedPassword,
        name,
        role: 'user',
      },
    })

    return {
      id: user.id,
      email: user.email,
      name: user.name,
    }
  }

  async login(email: string, password: string) {
    const user = await this.db.users.findUnique({ where: { email } })
    if (!user) {
      throw new UnauthorizedException('Invalid credentials')
    }

    const valid = await bcrypt.compare(password, user.password)
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials')
    }

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    }

    const expiresIn = this.config.getOrThrow('jwt.expiresIn')
    const accessToken = await this.jwt.signAsync(payload, {
      expiresIn,
    })

    const refreshExpiresIn = this.config.getOrThrow('jwt.refreshExpiresIn')
    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, type: 'refresh' },
      { expiresIn: refreshExpiresIn },
    )

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    }
  }

  async refresh(refreshToken: string) {
    try {
      const payload = await this.jwt.verifyAsync<{ sub: string; type: string }>(
        refreshToken,
      )

      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Invalid token type')
      }

      const user = await this.db.users.findUnique({
        where: { id: payload.sub },
      })

      if (!user) {
        throw new UnauthorizedException('User not found')
      }

      const newPayload: JwtPayload = {
        sub: user.id,
        email: user.email,
        role: user.role,
      }

      const expiresIn = this.config.getOrThrow('jwt.expiresIn')
      const accessToken = await this.jwt.signAsync(newPayload, {
        expiresIn,
      })

      const refreshExpiresIn = this.config.getOrThrow('jwt.refreshExpiresIn')
      const newRefreshToken = await this.jwt.signAsync(
        { sub: user.id, type: 'refresh' },
        { expiresIn: refreshExpiresIn },
      )

      return { accessToken, refreshToken: newRefreshToken }
    } catch {
      throw new UnauthorizedException('Invalid refresh token')
    }
  }

  async validateToken(token: string) {
    try {
      const payload = await this.jwt.verifyAsync<JwtPayload>(token)
      const user = await this.db.users.findUnique({
        where: { id: payload.sub },
      })
      return user
    } catch {
      return null
    }
  }
}
```

## Auth Guard

```typescript
// modules/auth/auth.guard.ts
import {
  AbstractExecutionContext,
  CanActivate,
  Injectable,
  UnauthorizedException,
} from '@navios/core'
import { inject } from '@navios/di'

import { AuthService } from './auth.service'

@Injectable()
export class AuthGuard implements CanActivate {
  private authService = inject(AuthService)

  async canActivate(context: AbstractExecutionContext): Promise<boolean> {
    const request = context.getRequest()
    const authHeader = request.headers.authorization

    if (!authHeader) {
      throw new UnauthorizedException('Missing authorization header')
    }

    if (!authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Invalid authorization format')
    }

    const token = authHeader.slice(7)
    const user = await this.authService.validateToken(token)

    if (!user) {
      throw new UnauthorizedException('Invalid or expired token')
    }

    request.user = user
    return true
  }
}
```

## Roles Attribute

Create a Roles attribute using `AttributeFactory.createAttribute`:

```typescript
// modules/auth/roles.attribute.ts
import { AttributeFactory } from '@navios/core'

import { z } from 'zod'

const RolesSymbol = Symbol.for('Roles')
const RolesSchema = z.object({
  roles: z.array(z.string()),
})

export const Roles = AttributeFactory.createAttribute(RolesSymbol, RolesSchema)

// Pre-bound role attributes for common use cases
export const OnlyAdmins = Roles({ roles: ['admin', 'owner'] })
export const OnlyOwners = Roles({ roles: ['owner'] })
export const OnlyModerators = Roles({ roles: ['moderator', 'admin'] })
```

## Roles Guard

The guard reads the Roles attribute from the execution context:

```typescript
// modules/auth/roles.guard.ts
import {
  AbstractExecutionContext,
  AttributeFactory,
  CanActivate,
  ForbiddenException,
  Injectable,
} from '@navios/core'

import { Roles } from './roles.attribute'

@Injectable()
export class RolesGuard implements CanActivate {
  async canActivate(context: AbstractExecutionContext): Promise<boolean> {
    const request = context.getRequest()
    const user = request.user

    if (!user) {
      throw new ForbiddenException('User not authenticated')
    }

    // Read Roles attribute from handler, controller, or module metadata
    const requiredRoles = AttributeFactory.getLast(Roles, [
      context.getModule(),
      context.getController(),
      context.getHandler(),
    ])

    // If no roles are required, allow access
    if (!requiredRoles) {
      return true
    }

    // Check if user has any of the required roles
    if (!requiredRoles.roles.includes(user.role)) {
      throw new ForbiddenException('Insufficient permissions')
    }

    return true
  }
}
```

## Auth Controller

```typescript
// modules/auth/auth.controller.ts
import {
  Controller,
  Endpoint,
  EndpointParams,
  HttpCode,
  UseGuards,
} from '@navios/core'
import { inject } from '@navios/di'

import {
  loginEndpoint,
  profileEndpoint,
  refreshEndpoint,
  registerEndpoint,
} from '../../api/auth.endpoints'
import { AuthGuard } from './auth.guard'
import { AuthService } from './auth.service'

@Controller()
export class AuthController {
  private authService = inject(AuthService)

  @Endpoint(registerEndpoint)
  @HttpCode(201)
  async register(params: EndpointParams<typeof registerEndpoint>) {
    return this.authService.register(
      params.data.email,
      params.data.password,
      params.data.name,
    )
  }

  @Endpoint(loginEndpoint)
  async login(params: EndpointParams<typeof loginEndpoint>) {
    return this.authService.login(params.data.email, params.data.password)
  }

  @Endpoint(refreshEndpoint)
  async refresh(params: EndpointParams<typeof refreshEndpoint>) {
    return this.authService.refresh(params.data.refreshToken)
  }

  @Endpoint(profileEndpoint)
  @UseGuards(AuthGuard)
  async profile(params: EndpointParams<typeof profileEndpoint>) {
    const request = params.request
    const user = request.user

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    }
  }
}
```

## Auth Module

Configure JWT service using the config token:

```typescript
// modules/auth/auth.module.ts
import { Module } from '@navios/core'
import { inject } from '@navios/di'
import { provideJwtService } from '@navios/jwt'

import { AuthConfigService } from '../../config/auth.config'
import { AuthController } from './auth.controller'

const JwtService = provideJwtService(async () => {
  const config = await inject(AuthConfigService)
  return {
    secret: config.getOrThrow('jwt.secret'),
    signOptions: {
      expiresIn: config.getOrThrow('jwt.expiresIn'),
    },
  }
})

@Module({
  controllers: [AuthController],
  providers: [JwtService],
})
export class AuthModule {}
```

## Protecting Routes

### Module-Level Protection

```typescript
@Module({
  controllers: [UserController, ProfileController],
  guards: [AuthGuard],
})
class UserModule {}
```

### Endpoint-Level Protection

Use the `@Roles` decorator to specify required roles:

```typescript
import { OnlyAdmins, Roles } from './modules/auth/roles.attribute'

@Controller({
  guards: [AuthGuard, RolesGuard],
})
// Or apply guards to the endpoint level:
// @UseGuards(AuthGuard, RolesGuard)
class AdminController {
  @Endpoint(listUsers)
  @Roles({ roles: ['admin', 'owner'] })
  async listUsers() {
    // Admins and owners can access
  }

  @Endpoint(deleteUser)
  @OnlyAdmins
  async deleteUser(params: EndpointParams<typeof deleteUser>) {
    // Admins and owners can access
  }

  @Endpoint(manageUsers)
  @OnlyAdmins
  async manageUsers() {
    // Inline role specification
  }
}
```

You can use either inline role specification with `@Roles({ roles: [...] })` or pre-bound attributes like `@OnlyAdmins()` for cleaner, reusable role definitions.

## Usage Examples

### Register

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "password123", "name": "John Doe"}'
```

### Login

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email": "user@example.com", "password": "password123"}'
```

### Access Protected Route

```bash
curl http://localhost:3000/auth/profile \
  -H "Authorization: Bearer <access_token>"
```

### Refresh Token

```bash
curl -X POST http://localhost:3000/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "<refresh_token>"}'
```

## Security Considerations

- Store JWT secrets in environment variables, never in code
- Use short expiration times for access tokens (15 minutes)
- Implement token revocation for logout functionality
- Use HTTPS in production
- Consider rate limiting on auth endpoints
- Hash passwords with bcrypt (cost factor 10+)
- Validate all input with Zod schemas

## Related

- [Authentication Guide](/docs/server/guides/authentication) - Authentication strategies and patterns
- [Guards guide](/docs/server/guides/guards) - Guard concepts and basics
- [Configuration](/docs/server/guides/configuration) - Managing configuration with ConfigService
- [JWT Package Documentation](/packages/jwt) - Complete JWT service reference
