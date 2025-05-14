# Prisma ORM

Prisma ORM is a modern database toolkit that simplifies database access and management. It provides a type-safe query builder, migrations, and an intuitive API for working with databases.

## Installation

Follow the steps from the [Prisma documentation](https://www.prisma.io/docs/getting-started/quickstart-typescript) to install Prisma in your project.

## Integration

The simplest way to integrate Prisma with your project is to create a factory:

```typescript
import { Injectable, InjectableType, InjectionToken } from '@navios/core'

import { PrismaClient } from '@prisma/client'

export const PrismaService = InjectionToken.create(PrismaClient)

@Injectable({
  token: PrismaService,
  type: InjectableType.Factory,
})
export class PrismaServiceFactory {
  async create() {
    const client = new PrismaClient()
    await client.$connect()
    return client
  }
}
```

## Usage

You can use the Prisma Service in your application by injecting it into your classes. Here's an example of how to use it in a service:

```typescript
import { Injectable, syncInject } from '@navios/core'

import { PrismaService } from './prisma.service.mjs'

@Injectable()
export class UserService {
  private readonly prisma = syncInject(PrismaService)

  async getUser(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
    })
  }

  async createUser(data: { name: string; email: string }) {
    return this.prisma.user.create({
      data,
    })
  }
}
```

That's it! You can now use Prisma in your application to interact with your database. You can find more information about Prisma and its features in the [Prisma documentation](https://www.prisma.io/docs/).
