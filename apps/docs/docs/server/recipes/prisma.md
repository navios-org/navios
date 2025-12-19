---
sidebar_position: 3
title: Prisma ORM
---

# Prisma ORM Integration

Integrate Prisma ORM with Navios for type-safe database access.

## Installation

```bash
npm install prisma @prisma/client @prisma/adapter-pg
npx prisma init
```

## Setup

### 1. Define Your Schema

```prisma
// prisma/schema.prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["driverAdapters"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  posts     Post[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Post {
  id        String   @id @default(cuid())
  title     String
  content   String?
  published Boolean  @default(false)
  author    User     @relation(fields: [authorId], references: [id])
  authorId  String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

### 2. Create Prisma Factory

Use the `@Factory` decorator with an `InjectionToken` to create the Prisma client:

```typescript
// src/database/prisma.factory.ts
import { Factory, InjectionToken } from '@navios/core'

import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

export const PrismaService = InjectionToken.create<PrismaClient>(
  Symbol('PrismaClient'),
)

@Factory({
  token: PrismaService,
})
export class PrismaFactory {
  async create() {
    const adapter = new PrismaPg({
      connectionString: process.env['DATABASE_URL'],
    })

    const client = new PrismaClient({
      adapter,
    })

    await client.$connect()

    return client
  }
}
```

### 3. With ConfigService

For better configuration management, use `ConfigService`:

```typescript
// src/database/prisma.factory.ts
import { Factory, InjectionToken, provideConfig } from '@navios/core'
import { inject } from '@navios/di'

import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@prisma/client'

// Define database config
interface DatabaseConfig {
  database: {
    url: string
    logging: boolean
  }
}

export const DatabaseConfigToken = provideConfig<DatabaseConfig>({
  load: () => ({
    database: {
      url: process.env['DATABASE_URL'] || '',
      logging: process.env['DATABASE_LOGGING'] === 'true',
    },
  }),
})

export const PrismaService = InjectionToken.create<PrismaClient>(
  Symbol('PrismaClient'),
)

@Factory({
  token: PrismaService,
})
export class PrismaFactory {
  private config = inject(DatabaseConfigToken)

  async create() {
    const dbConfig = this.config.getOrThrow('database')

    const adapter = new PrismaPg({
      connectionString: dbConfig.url,
    })

    const client = new PrismaClient({
      adapter,
      log: dbConfig.logging ? ['query', 'info', 'warn', 'error'] : ['error'],
    })

    await client.$connect()

    return client
  }
}
```

### 4. Create Repository Services

```typescript
// src/services/user.service.ts
import { NotFoundException } from '@navios/core'
import { inject, Injectable } from '@navios/di'

import { PrismaService } from '../database/prisma.factory.js'

@Injectable()
export class UserService {
  private prisma = inject(PrismaService)

  async findAll(params?: { skip?: number; take?: number }) {
    return this.prisma.user.findMany({
      skip: params?.skip,
      take: params?.take,
      orderBy: { createdAt: 'desc' },
    })
  }

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { posts: true },
    })

    if (!user) {
      throw new NotFoundException(`User ${id} not found`)
    }

    return user
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    })
  }

  async create(data: { email: string; name?: string }) {
    return this.prisma.user.create({ data })
  }

  async update(id: string, data: { email?: string; name?: string }) {
    await this.findById(id) // Throws if not found
    return this.prisma.user.update({
      where: { id },
      data,
    })
  }

  async delete(id: string) {
    await this.findById(id) // Throws if not found
    return this.prisma.user.delete({
      where: { id },
    })
  }
}
```

### 5. Create Controller

```typescript
// src/controllers/user.controller.ts
import { Controller, Endpoint, EndpointParams, HttpCode } from '@navios/core'
import { inject } from '@navios/di'

import {
  createUser,
  deleteUser,
  getUser,
  listUsers,
  updateUser,
} from '../api/users.js'
import { UserService } from '../services/user.service.js'

@Controller()
export class UserController {
  private userService = inject(UserService)

  @Endpoint(listUsers)
  async listUsers(params: EndpointParams<typeof listUsers>) {
    return this.userService.findAll({
      skip: (params.query.page - 1) * params.query.limit,
      take: params.query.limit,
    })
  }

  @Endpoint(getUser)
  async getUser(params: EndpointParams<typeof getUser>) {
    return this.userService.findById(params.urlParams.userId)
  }

  @Endpoint(createUser)
  @HttpCode(201)
  async createUser(params: EndpointParams<typeof createUser>) {
    return this.userService.create(params.data)
  }

  @Endpoint(updateUser)
  async updateUser(params: EndpointParams<typeof updateUser>) {
    return this.userService.update(params.urlParams.userId, params.data)
  }

  @Endpoint(deleteUser)
  @HttpCode(204)
  async deleteUser(params: EndpointParams<typeof deleteUser>) {
    await this.userService.delete(params.urlParams.userId)
  }
}
```

### 6. Define API Endpoints

```typescript
// src/api/users.ts
import { builder } from '@navios/builder'

import { z } from 'zod'

const API = builder()

const userSchema = z.object({
  id: z.string(),
  email: z.string(),
  name: z.string().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
})

export const listUsers = API.declareEndpoint({
  method: 'GET',
  url: '/users',
  querySchema: z.object({
    page: z.coerce.number().default(1),
    limit: z.coerce.number().default(10),
  }),
  responseSchema: z.array(userSchema),
})

export const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

export const createUser = API.declareEndpoint({
  method: 'POST',
  url: '/users',
  requestSchema: z.object({
    email: z.string().email(),
    name: z.string().optional(),
  }),
  responseSchema: userSchema,
})

export const updateUser = API.declareEndpoint({
  method: 'PUT',
  url: '/users/$userId',
  requestSchema: z.object({
    email: z.string().email().optional(),
    name: z.string().optional(),
  }),
  responseSchema: userSchema,
})

export const deleteUser = API.declareEndpoint({
  method: 'DELETE',
  url: '/users/$userId',
  responseSchema: z.object({}),
})
```

## Transactions

Use Prisma transactions for atomic operations:

```typescript
@Injectable()
export class OrderService {
  private prisma = inject(PrismaService)

  async createOrder(userId: string, items: OrderItem[]) {
    return this.prisma.$transaction(async (tx) => {
      // Create order
      const order = await tx.order.create({
        data: {
          userId,
          status: 'pending',
        },
      })

      // Create order items
      await tx.orderItem.createMany({
        data: items.map((item) => ({
          orderId: order.id,
          productId: item.productId,
          quantity: item.quantity,
        })),
      })

      // Update inventory
      for (const item of items) {
        await tx.product.update({
          where: { id: item.productId },
          data: {
            stock: { decrement: item.quantity },
          },
        })
      }

      return order
    })
  }
}
```

## Soft Deletes

Implement soft delete pattern:

```prisma
// prisma/schema.prisma
model User {
  id        String    @id @default(cuid())
  email     String    @unique
  deletedAt DateTime?
  // ...
}
```

```typescript
// user.service.ts
@Injectable()
export class UserService {
  private prisma = inject(PrismaService)

  async findAll() {
    return this.prisma.user.findMany({
      where: { deletedAt: null },
    })
  }

  async softDelete(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
  }

  async restore(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: { deletedAt: null },
    })
  }
}
```

## Pagination Helper

Create reusable pagination:

```typescript
interface PaginationParams {
  page: number
  limit: number
}

interface PaginatedResult<T> {
  data: T[]
  meta: {
    total: number
    page: number
    limit: number
    totalPages: number
  }
}

@Injectable()
export class UserService {
  private prisma = inject(PrismaService)

  async findAllPaginated(
    params: PaginationParams,
  ): Promise<PaginatedResult<User>> {
    const { page, limit } = params
    const skip = (page - 1) * limit

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({ skip, take: limit }),
      this.prisma.user.count(),
    ])

    return {
      data,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    }
  }
}
```
