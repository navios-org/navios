---
sidebar_position: 9
title: Migrating from NestJS
---

# Migrating from NestJS

This guide helps you migrate an existing NestJS application to Navios. With legacy decorator support, you can migrate incrementally while keeping your existing TypeScript configuration.

## Overview

Navios provides a `legacy-compat` export that supports TypeScript's experimental decorators. This means you can migrate your codebase without changing your `tsconfig.json` or build tooling immediately.

**Key differences from NestJS:**

| Concept    | NestJS                                 | Navios                              |
| ---------- | -------------------------------------- | ----------------------------------- |
| Decorators | Experimental (legacy)                  | Stage 3 (native) or legacy-compat   |
| DI         | Constructor injection with `@Inject()` | Property injection with `inject()`  |
| Validation | class-validator + class-transformer    | Zod schemas in endpoint definitions |
| Routing    | Decorators (`@Get()`, `@Post()`)       | Builder API with `@Endpoint()`      |
| Providers  | Manual registration in modules         | Auto-discovered via `@Injectable()` |
| Exports    | Manual exports between modules         | Automatic via imports               |

## Step 1: Install Dependencies

```bash
# Remove NestJS dependencies (optional - can coexist during migration)
npm uninstall @nestjs/common @nestjs/core @nestjs/platform-express

# Install Navios
npm install @navios/core @navios/adapter-fastify @navios/builder zod
```

## Step 2: Configure TypeScript for Legacy Decorators

If your project already uses `experimentalDecorators`, no changes needed. Navios supports both:

**Option A: Keep experimental decorators (recommended for migration)**

```json title="tsconfig.json"
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true
  }
}
```

Import from `legacy-compat`:

```typescript
import {
  Controller,
  Endpoint,
  Module,
  UseGuards,
} from '@navios/core/legacy-compat'
```

**Option B: Use Stage 3 decorators (recommended for new code)**

```json title="tsconfig.json"
{
  "compilerOptions": {
    "experimentalDecorators": false
  }
}
```

Import from main package:

```typescript
import { Controller, Endpoint, Module, UseGuards } from '@navios/core'
```

## Step 3: Migrate Modules

NestJS modules have `providers` and `exports` arrays. Navios simplifies this - services are auto-discovered through DI.

### Before (NestJS)

```typescript
import { Module } from '@nestjs/common'

import { UserController } from './user.controller'
import { UserRepository } from './user.repository'
import { UserService } from './user.service'

@Module({
  controllers: [UserController],
  providers: [UserService, UserRepository],
  exports: [UserService],
})
export class UserModule {}
```

### After (Navios)

```typescript
import { Module } from '@navios/core/legacy-compat'

import { UserController } from './user.controller'

@Module({
  controllers: [UserController],
})
export class UserModule {}
```

**What changed:**

- No `providers` array - services decorated with `@Injectable()` are auto-registered
- No `exports` array - imported modules share their services automatically

## Step 4: Migrate DTOs to Zod Schemas

NestJS uses class-validator decorators. Navios uses Zod schemas defined in endpoints. You'll need to understand this before migrating controllers, as controllers use these schemas in their endpoint definitions.

### Before (NestJS)

```typescript title="create-user.dto.ts"
import { IsEmail, IsString, MinLength } from 'class-validator'

export class CreateUserDto {
  @IsString()
  @MinLength(2)
  name: string

  @IsEmail()
  email: string
}
```

### After (Navios)

```typescript title="user.endpoints.ts"
import { builder } from '@navios/builder'

import { z } from 'zod'

const API = builder()

// Schema defined inline with endpoint
export const createUser = API.declareEndpoint({
  method: 'POST',
  url: '/users',
  requestSchema: z.object({
    name: z.string().min(2),
    email: z.string().email(),
  }),
  responseSchema: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
  }),
})

// Or extract for reuse
const createUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
})

const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
})

export const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$id',
  responseSchema: userSchema,
})
```

**Benefits:**

- Request AND response validation (NestJS only validates requests)
- Type inference from schemas - no manual type definitions
- Schemas can be shared with frontend

## Step 5: Migrate Controllers

NestJS uses method decorators for HTTP verbs. Navios uses a Builder API for type-safe endpoint definitions. The endpoint definitions with Zod schemas (from Step 4) are used here.

### Before (NestJS)

```typescript
import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common'

import { CreateUserDto } from './dto/create-user.dto'
import { UserService } from './user.service'

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get(':id')
  async getUser(@Param('id') id: string) {
    return this.userService.findById(id)
  }

  @Post()
  @HttpCode(201)
  async createUser(@Body() createUserDto: CreateUserDto) {
    return this.userService.create(createUserDto)
  }
}
```

### After (Navios)

Use the endpoint definitions you created in Step 4 (with Zod schemas) in your controller:

```typescript title="user.controller.ts"
import type { EndpointParams } from '@navios/core/legacy-compat'

import { Controller, Endpoint, HttpCode } from '@navios/core/legacy-compat'
import { inject } from '@navios/di'

import { createUser, getUser } from './user.endpoints'
import { UserService } from './user.service'

@Controller()
export class UserController {
  private userService = inject(UserService)

  @Endpoint(getUser)
  async getUser(params: EndpointParams<typeof getUser>) {
    return this.userService.findById(params.urlParams.id)
  }

  @Endpoint(createUser)
  @HttpCode(201)
  async createUser(params: EndpointParams<typeof createUser>) {
    return this.userService.create(params.data)
  }
}
```

**What changed:**

- HTTP method and path defined in Builder, not decorators
- Request/response schemas use Zod instead of class-validator DTOs
- URL params accessed via `params.urlParams`, body via `params.data`
- Constructor injection replaced with `inject()` property injection

## Step 6: Migrate Services

NestJS services use constructor injection. Navios uses property injection with `inject()`.

### Before (NestJS)

```typescript
import { Inject, Injectable, Logger } from '@nestjs/common'

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name)

  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CacheService) private readonly cache: CacheService,
  ) {}

  async findById(id: string) {
    const cached = await this.cache.get(`user:${id}`)
    if (cached) return cached

    const user = await this.database.users.findUnique({ where: { id } })
    await this.cache.set(`user:${id}`, user)
    return user
  }
}
```

### After (Navios)

```typescript
import { Logger } from '@navios/core'
import { inject, Injectable } from '@navios/di'

@Injectable()
export class UserService {
  private database = inject(DatabaseService)
  private cache = inject(CacheService)
  private logger = inject(Logger, { context: 'UserService' })

  async findById(id: string) {
    const cached = await this.cache.get(`user:${id}`)
    if (cached) return cached

    const user = await this.database.users.findUnique({ where: { id } })
    await this.cache.set(`user:${id}`, user)
    return user
  }
}
```

**What changed:**

- No constructor - dependencies injected as class properties
- `@Inject()` decorator replaced with `inject()` function
- Logger accepts options directly: `inject(Logger, { context: 'UserService' })`

### Sync vs Async Injection

Use `inject()` for standard dependency injection:

```typescript
private userService = inject(UserService)
```

Use `asyncInject()` for:

- **Circular dependencies** - replacement for NestJS `forwardRef()`
- **Lazy loading** - services with expensive initialization that are rarely used

```typescript
// Circular dependency resolution (like forwardRef in NestJS)
private otherService = asyncInject(OtherService)

// Lazy-loaded service
private heavyService = asyncInject(HeavyAnalyticsService)
```

## Step 7: Migrate Guards

NestJS guards implement `CanActivate` and use `ExecutionContext`. Navios guards are similar but use `AbstractExecutionContext`.

### Before (NestJS)

```typescript
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    const token = this.extractToken(request)

    if (!token) {
      throw new UnauthorizedException()
    }

    try {
      const payload = await this.jwtService.verifyAsync(token)
      request.user = payload
    } catch {
      throw new UnauthorizedException()
    }

    return true
  }

  private extractToken(request: any): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? []
    return type === 'Bearer' ? token : undefined
  }
}
```

### After (Navios)

```typescript
import {
  AbstractExecutionContext,
  CanActivate,
  Injectable,
  UnauthorizedException,
} from '@navios/core'
import { inject } from '@navios/di'

import { JwtService } from './jwt.service'

@Injectable()
export class AuthGuard implements CanActivate {
  private jwtService = inject(JwtService)

  async canActivate(context: AbstractExecutionContext): Promise<boolean> {
    const request = context.getRequest()
    const token = this.extractToken(request)

    if (!token) {
      throw new UnauthorizedException()
    }

    try {
      const payload = await this.jwtService.verify(token)
      request.user = payload
    } catch {
      throw new UnauthorizedException()
    }

    return true
  }

  private extractToken(request: any): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? []
    return type === 'Bearer' ? token : undefined
  }
}
```

**What changed:**

- `ExecutionContext` → `AbstractExecutionContext`
- `context.switchToHttp().getRequest()` → `context.getRequest()`
- Constructor injection → property injection with `inject()`

### Applying Guards

**NestJS:**

```typescript
@UseGuards(AuthGuard)
@Controller('users')
export class UserController {}
```

**Navios - Module level:**

```typescript
@Module({
  controllers: [UserController],
  guards: [AuthGuard],
})
export class UserModule {}
```

**Navios - Endpoint level:**

```typescript
import { UseGuards } from '@navios/core/legacy-compat'

@Controller()
export class UserController {
  @Endpoint(deleteUser)
  @UseGuards(AdminGuard)
  async deleteUser(params: EndpointParams<typeof deleteUser>) {
    // ...
  }
}
```

## Step 8: Migrate the Bootstrap

### Before (NestJS)

```typescript
import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'

import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  app.useGlobalPipes(new ValidationPipe())
  await app.listen(3000)
}
bootstrap()
```

### After (Navios)

```typescript
import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { NaviosFactory } from '@navios/core'

import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NaviosFactory.create(AppModule, {
    adapter: defineFastifyEnvironment(),
    logger: ['log', 'error', 'warn'],
  })

  await app.listen({ port: 3000 })
  console.log('Server running on http://localhost:3000')
}

bootstrap()
```

**What changed:**

- `NestFactory` → `NaviosFactory`
- Adapter explicitly defined (Fastify, Bun, etc.)
- No global validation pipe needed - validation is built into endpoints

## Migration Checklist

Use this checklist to track your migration progress:

- [ ] Install Navios dependencies
- [ ] Configure `legacy-compat` imports (or switch to Stage 3)
- [ ] Migrate modules (remove `providers`/`exports`)
- [ ] Replace DTOs with Zod schemas and create endpoint definitions with Builder
- [ ] Migrate controllers to use `@Endpoint()`
- [ ] Migrate services to property injection
- [ ] Migrate guards to `AbstractExecutionContext`
- [ ] Update bootstrap file
- [ ] Update tests to use `createTestingModule`

## Common Migration Issues

### "Cannot find module '@navios/core/legacy-compat'"

Ensure you're using `@navios/core` version 0.7.0 or later.

### Circular dependency errors

Navios DI handles circular dependencies better than NestJS. If you encounter issues, use `asyncInject()` for lazy resolution (replaces NestJS `forwardRef()`):

```typescript
// Use asyncInject() for circular dependencies
private userService = asyncInject(UserService)
```

### Missing request properties

NestJS decorators like `@Body()`, `@Param()`, `@Query()` are replaced by the `EndpointParams` type:

| NestJS                  | Navios                                                                     |
| ----------------------- | -------------------------------------------------------------------------- |
| `@Body() dto`           | `params.data`                                                              |
| `@Param('id') id`       | `params.urlParams.id`                                                      |
| `@Query('page') page`   | `params.query.page`                                                        |
| `@Headers('auth') auth` | `private request = inject(FastifyRequest)` and `this.request.headers.auth` |

For headers, inject the raw request:

```typescript
import type { FastifyRequest } from 'fastify'

import { inject } from '@navios/di'

@Controller()
export class UserController {
  private request = inject(FastifyRequest)

  @Endpoint(getUser)
  async getUser(params: EndpointParams<typeof getUser>) {
    const authHeader = this.request.headers.authorization
    // ...
  }
}
```

### Service scope differences

| NestJS Scope          | Navios Scope                |
| --------------------- | --------------------------- |
| `DEFAULT` (singleton) | `InjectableScope.Singleton` |
| `REQUEST`             | `InjectableScope.Request`   |
| `TRANSIENT`           | `InjectableScope.Transient` |

## Next Steps

After migration:

- [Architecture Overview](/docs/server/overview/overview) - Understand Navios patterns
- [Testing](/docs/server/guides/testing) - Update your test suite
- [Configuration](/docs/server/guides/configuration) - Set up environment config
- Consider migrating to Stage 3 decorators for better tooling support
