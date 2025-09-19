# Getting Started

This guide will help you get up and running with Navios DI quickly. We'll cover installation, basic setup, and your first dependency injection example.

## Installation

Install Navios DI using your preferred package manager:

```bash
# npm
npm install @navios/di

# yarn
yarn add @navios/di

# pnpm
pnpm add @navios/di
```

## Prerequisites

- Node.js 18+
- TypeScript 4.5+
- A modern TypeScript project

## Basic Setup

### 1. Make sure Legacy Decorators disabled

Make sure your `tsconfig.json` has legacy decorators disabled:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "node16"
  }
}
```

### 2. Import the Library

```typescript
import { asyncInject, Container, inject, Injectable } from '@navios/di'
```

## Your First Example

Let's create a simple example with a user service that depends on an email service:

```typescript
import { asyncInject, Container, inject, Injectable } from '@navios/di'

// 1. Create an email service
@Injectable()
class EmailService {
  async sendEmail(to: string, subject: string, body: string) {
    console.log(`Sending email to ${to}`)
    console.log(`Subject: ${subject}`)
    console.log(`Body: ${body}`)
    return { success: true, messageId: Math.random().toString(36) }
  }
}

// 2. Create a user service that depends on the email service
@Injectable()
class UserService {
  private readonly emailService = asyncInject(EmailService)

  async createUser(name: string, email: string) {
    console.log(`Creating user: ${name}`)

    // Get the email service and send welcome email
    const emailService = await this.emailService
    await emailService.sendEmail(
      email,
      'Welcome!',
      `Hello ${name}, welcome to our platform!`,
    )

    return { id: Math.random().toString(36), name, email }
  }
}

// 3. Use the services
async function main() {
  const container = new Container()

  // Get the user service (email service will be automatically injected)
  const userService = await container.get(UserService)

  // Create a user
  const user = await userService.createUser('Alice', 'alice@example.com')
  console.log('Created user:', user)
}

// Run the example
main().catch(console.error)
```

## Understanding the Example

### Service Registration

The `@Injectable()` decorator tells Navios DI that this class can be injected into other services:

```typescript
@Injectable()
class EmailService {
  // Service implementation
}
```

### Dependency Injection

The `inject()` function injects a dependency synchronously:

```typescript
@Injectable()
class UserService {
  private readonly emailService = inject(EmailService)
  //                                    ^^^^^^^^^^^^
  //                                    Dependency injection
}
```

### Container Usage

The `Container` class manages all your services:

```typescript
const container = new Container()
const userService = await container.get(UserService)
//                                    ^^^^^^^^^^^^
//                                    Get service instance
```

## Alternative Injection Methods

### Asynchronous Injection

Use `asyncInject()` for asynchronous dependency resolution:

```typescript
@Injectable()
class UserService {
  private readonly emailService = asyncInject(EmailService)

  async createUser(name: string, email: string) {
    const emailService = await this.emailService
    //                   ^^^^^^^^^^^^^^^^^^^^^^^
    //                   Await the dependency
    await emailService.sendEmail(email, 'Welcome!', `Hello ${name}!`)
  }
}
```

## Service Scopes

### Singleton (Default)

Services are singletons by default - one instance shared across the application:

```typescript
@Injectable() // Same as @Injectable({ scope: InjectableScope.Singleton })
class SingletonService {
  private readonly id = Math.random()

  getId() {
    return this.id
  }
}

// Both instances will have the same ID
const service1 = await container.get(SingletonService)
const service2 = await container.get(SingletonService)
console.log(service1.getId() === service2.getId()) // true
```

### Transient

Create a new instance for each injection:

```typescript
import { InjectableScope } from '@navios/di'

@Injectable({ scope: InjectableScope.Transient })
class TransientService {
  private readonly id = Math.random()

  getId() {
    return this.id
  }
}

// Each instance will have a different ID
const service1 = await container.get(TransientService)
const service2 = await container.get(TransientService)
console.log(service1.getId() === service2.getId()) // false
```

## Next Steps

Now that you have the basics down, explore these topics:

- **[Container](./container.md)** - Learn about the Container API
- **[Injectable Decorator](./injectable.md)** - Deep dive into service registration
- **[Factory Decorator](./factory.md)** - Create services using factory pattern
- **[Injection Tokens](./injection-tokens.md)** - Flexible dependency resolution
- **[Service Lifecycle](./lifecycle.md)** - Initialization and cleanup hooks

## Common Patterns

### Configuration Service

```typescript
import { Injectable, InjectionToken } from '@navios/di'

import { z } from 'zod'

const configSchema = z.object({
  apiUrl: z.string(),
  timeout: z.number(),
})

const CONFIG_TOKEN = InjectionToken.create<ConfigService, typeof configSchema>(
  'APP_CONFIG',
  configSchema,
)

@Injectable({ token: CONFIG_TOKEN })
class ConfigService {
  constructor(private config: z.infer<typeof configSchema>) {}

  getApiUrl() {
    return this.config.apiUrl
  }

  getTimeout() {
    return this.config.timeout
  }
}

// Usage
const config = await container.get(CONFIG_TOKEN, {
  apiUrl: 'https://api.example.com',
  timeout: 5000,
})
```

### Service with Lifecycle

```typescript
import { Injectable, OnServiceDestroy, OnServiceInit } from '@navios/di'

@Injectable()
class DatabaseService implements OnServiceInit, OnServiceDestroy {
  private connection: any = null

  async onServiceInit() {
    console.log('Connecting to database...')
    this.connection = await this.connect()
    console.log('Database connected')
  }

  async onServiceDestroy() {
    console.log('Disconnecting from database...')
    if (this.connection) {
      await this.connection.close()
    }
  }

  private async connect() {
    // Database connection logic
    return { connected: true }
  }
}
```

## Troubleshooting

### Common Issues

**Decorators not working:**

- Ensure `experimentalDecorators: false` in `tsconfig.json`
- Make sure you're using TypeScript 5+

**Circular dependencies:**

- Use `asyncInject()` instead of `inject()` for circular dependencies
- Consider restructuring your services to avoid circular references

**Services not found:**

- Make sure services are decorated with `@Injectable()`
- Check that services are imported before use

**Type errors:**

- Ensure proper TypeScript configuration
- Use proper type annotations for injected services

### Getting Help

- Check the [API Reference](./api-reference.md)
- Look at [Advanced Patterns](./advanced-patterns.md)
- Review the [Examples](./examples/) folder
