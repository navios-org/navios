---
sidebar_position: 2
title: Authentication
---

# Authentication

Complete authentication implementation with JWT tokens, user lookup, and role-based access control.

## Overview

This recipe covers:

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
├── api/
│   └── auth.endpoints.ts
├── modules/
│   └── auth/
│       ├── auth.module.ts
│       ├── auth.controller.ts
│       ├── auth.service.ts
│       ├── auth.guard.ts
│       └── roles.guard.ts
└── main.ts
```

## Configuration

```typescript
// config/auth.config.ts
import { ConfigService } from '@navios/core'

export interface AuthConfig {
  jwt: {
    secret: string
    expiresIn: string
    refreshSecret: string
    refreshExpiresIn: string
  }
}

export const authConfig = new ConfigService<AuthConfig>({
  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key',
    expiresIn: '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'your-refresh-secret',
    refreshExpiresIn: '7d',
  },
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
import { Injectable, ConflictException, UnauthorizedException } from '@navios/core'
import { inject } from '@navios/di'
import { JwtService } from '@navios/jwt'
import * as bcrypt from 'bcrypt'

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

  async register(email: string, password: string, name: string) {
    // Check if user exists
    const existing = await this.db.users.findUnique({ where: { email } })
    if (existing) {
      throw new ConflictException('Email already registered')
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10)

    // Create user
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
    // Find user
    const user = await this.db.users.findUnique({ where: { email } })
    if (!user) {
      throw new UnauthorizedException('Invalid credentials')
    }

    // Verify password
    const valid = await bcrypt.compare(password, user.password)
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials')
    }

    // Generate tokens
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    }

    const accessToken = await this.jwt.signAsync(payload, {
      expiresIn: '15m',
    })

    const refreshToken = await this.jwt.signAsync(
      { sub: user.id, type: 'refresh' },
      { expiresIn: '7d' },
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

      const accessToken = await this.jwt.signAsync(newPayload, {
        expiresIn: '15m',
      })

      const newRefreshToken = await this.jwt.signAsync(
        { sub: user.id, type: 'refresh' },
        { expiresIn: '7d' },
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
  Injectable,
  CanActivate,
  AbstractExecutionContext,
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

    // Attach user to request for use in handlers
    request.user = user
    return true
  }
}
```

## Roles Guard

```typescript
// modules/auth/roles.guard.ts
import {
  Injectable,
  CanActivate,
  AbstractExecutionContext,
  ForbiddenException,
} from '@navios/core'

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private allowedRoles: string[]) {}

  async canActivate(context: AbstractExecutionContext): Promise<boolean> {
    const request = context.getRequest()
    const user = request.user

    if (!user) {
      throw new ForbiddenException('User not authenticated')
    }

    if (!this.allowedRoles.includes(user.role)) {
      throw new ForbiddenException('Insufficient permissions')
    }

    return true
  }
}

// Helper function for creating role-specific guards
export function Roles(...roles: string[]) {
  return new RolesGuard(roles)
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
  registerEndpoint,
  loginEndpoint,
  refreshEndpoint,
  profileEndpoint,
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
    const request = inject(Request)
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

```typescript
// modules/auth/auth.module.ts
import { Module } from '@navios/core'
import { JwtModule } from '@navios/jwt'

import { AuthController } from './auth.controller'

@Module({
  controllers: [AuthController],
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-secret-key',
    }),
  ],
})
export class AuthModule {}
```

## Protecting Routes

### Module-Level Protection

```typescript
// All routes in this module require authentication
@Module({
  controllers: [UserController, ProfileController],
  guards: [AuthGuard],
})
class UserModule {}
```

### Endpoint-Level Protection

```typescript
@Controller()
class AdminController {
  @Endpoint(listUsers)
  @UseGuards(AuthGuard, Roles('admin'))
  async listUsers() {
    // Only admins can access
  }

  @Endpoint(deleteUser)
  @UseGuards(AuthGuard, Roles('admin', 'superadmin'))
  async deleteUser(params: EndpointParams<typeof deleteUser>) {
    // Admins and superadmins can access
  }
}
```

## Usage Example

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

- [Guards guide](/docs/server/guides/guards) - Guard concepts and basics
- [JWT package](/docs/server/recipes/jwt) - JWT package reference
- [Configuration](/docs/server/guides/configuration) - Managing secrets
