---
sidebar_position: 3
---

# API Clients

This recipe shows how to create CLI commands that interact with REST APIs, including authentication, request handling, and response formatting.

## Basic API Client

Create a service for API interactions:

```typescript
import { inject, Injectable } from '@navios/di'
import { z } from 'zod'

@Injectable()
class ApiClient {
  private baseUrl: string

  constructor(baseUrl: string = 'https://api.example.com') {
    this.baseUrl = baseUrl
  }

  async get(endpoint: string, headers?: Record<string, string>) {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    })

    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`)
    }

    return response.json()
  }

  async post(endpoint: string, data: any, headers?: Record<string, string>) {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`)
    }

    return response.json()
  }
}
```

## API Commands

Create commands for API operations:

```typescript
import { Command, CommandHandler } from '@navios/commander'

const getSchema = z.object({
  endpoint: z.string(),
  format: z.enum(['json', 'table']).default('json'),
})

@Command({
  path: 'api:get',
  optionsSchema: getSchema,
})
export class ApiGetCommand implements CommandHandler<
  z.infer<typeof getSchema>
> {
  private apiClient = inject(ApiClient)

  async execute(options) {
    const data = await this.apiClient.get(options.endpoint)
    
    if (options.format === 'json') {
      console.log(JSON.stringify(data, null, 2))
    } else {
      this.printTable(data)
    }
  }

  private printTable(data: any) {
    // Table formatting logic
    if (Array.isArray(data)) {
      data.forEach((item, index) => {
        console.log(`${index + 1}.`, JSON.stringify(item))
      })
    } else {
      Object.entries(data).forEach(([key, value]) => {
        console.log(`${key}: ${value}`)
      })
    }
  }
}

const postSchema = z.object({
  endpoint: z.string(),
  data: z.string(), // JSON string
})

@Command({
  path: 'api:post',
  optionsSchema: postSchema,
})
export class ApiPostCommand implements CommandHandler<
  z.infer<typeof postSchema>
> {
  private apiClient = inject(ApiClient)

  async execute(options) {
    const data = JSON.parse(options.data)
    const result = await this.apiClient.post(options.endpoint, data)
    console.log(JSON.stringify(result, null, 2))
  }
}
```

## Authenticated API Client

Create an authenticated API client:

```typescript
@Injectable()
class AuthenticatedApiClient {
  private baseUrl: string
  private token: string | null = null

  constructor(baseUrl: string = 'https://api.example.com') {
    this.baseUrl = baseUrl
  }

  async login(username: string, password: string) {
    const response = await fetch(`${this.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })

    if (!response.ok) {
      throw new Error('Authentication failed')
    }

    const data = await response.json()
    this.token = data.token
    return data
  }

  async get(endpoint: string) {
    if (!this.token) {
      throw new Error('Not authenticated. Call login first.')
    }

    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`,
      },
    })

    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`)
    }

    return response.json()
  }
}

const loginSchema = z.object({
  username: z.string(),
  password: z.string(),
})

@Command({
  path: 'api:login',
  optionsSchema: loginSchema,
})
export class ApiLoginCommand implements CommandHandler<
  z.infer<typeof loginSchema>
> {
  private apiClient = inject(AuthenticatedApiClient)

  async execute(options) {
    const result = await this.apiClient.login(options.username, options.password)
    console.log('Logged in successfully')
    console.log('Token:', result.token)
  }
}
```

## User Management Commands

Create commands for user management:

```typescript
@Injectable()
class UserApiService {
  private apiClient = inject(AuthenticatedApiClient)

  async getUsers() {
    return this.apiClient.get('/users')
  }

  async getUser(id: string) {
    return this.apiClient.get(`/users/${id}`)
  }

  async createUser(data: { name: string; email: string }) {
    const response = await fetch(`${this.apiClient.baseUrl}/users`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiClient.token}`,
      },
      body: JSON.stringify(data),
    })

    if (!response.ok) {
      throw new Error(`Failed to create user: ${response.statusText}`)
    }

    return response.json()
  }

  async deleteUser(id: string) {
    const response = await fetch(`${this.apiClient.baseUrl}/users/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${this.apiClient.token}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Failed to delete user: ${response.statusText}`)
    }

    return { success: true }
  }
}

@Command({ path: 'user:list' })
export class ListUsersCommand implements CommandHandler {
  private userService = inject(UserApiService)

  async execute() {
    const users = await this.userService.getUsers()
    console.log('Users:')
    users.forEach((user: any) => {
      console.log(`  - ${user.name} (${user.email})`)
    })
  }
}

const getUserSchema = z.object({
  id: z.string(),
})

@Command({
  path: 'user:show',
  optionsSchema: getUserSchema,
})
export class ShowUserCommand implements CommandHandler<
  z.infer<typeof getUserSchema>
> {
  private userService = inject(UserApiService)

  async execute(options) {
    const user = await this.userService.getUser(options.id)
    console.log(JSON.stringify(user, null, 2))
  }
}

const createUserSchema = z.object({
  name: z.string(),
  email: z.string().email(),
})

@Command({
  path: 'user:create',
  optionsSchema: createUserSchema,
})
export class CreateUserCommand implements CommandHandler<
  z.infer<typeof createUserSchema>
> {
  private userService = inject(UserApiService)

  async execute(options) {
    const user = await this.userService.createUser(options)
    console.log('User created:', JSON.stringify(user, null, 2))
  }
}

const deleteUserSchema = z.object({
  id: z.string(),
})

@Command({
  path: 'user:delete',
  optionsSchema: deleteUserSchema,
})
export class DeleteUserCommand implements CommandHandler<
  z.infer<typeof deleteUserSchema>
> {
  private userService = inject(UserApiService)

  async execute(options) {
    await this.userService.deleteUser(options.id)
    console.log(`User ${options.id} deleted`)
  }
}
```

## Configuration Service

Use configuration for API settings:

```typescript
import { Injectable, InjectionToken } from '@navios/di'

const apiConfigSchema = z.object({
  baseUrl: z.string().url(),
  timeout: z.number().default(5000),
  retries: z.number().default(3),
})

const API_CONFIG_TOKEN = InjectionToken.create<
  ApiConfig,
  typeof apiConfigSchema
>('API_CONFIG', apiConfigSchema)

@Injectable({ token: API_CONFIG_TOKEN })
class ApiConfig {
  constructor(
    public baseUrl: string,
    public timeout: number,
    public retries: number
  ) {}
}

@Injectable()
class ConfiguredApiClient {
  private config = inject(API_CONFIG_TOKEN, {
    baseUrl: 'https://api.example.com',
    timeout: 5000,
    retries: 3,
  })

  async get(endpoint: string) {
    // Use config.baseUrl, config.timeout, config.retries
    const response = await fetch(`${this.config.baseUrl}${endpoint}`, {
      signal: AbortSignal.timeout(this.config.timeout),
    })
    return response.json()
  }
}
```

## Error Handling

Handle API errors gracefully:

```typescript
@Injectable()
class ErrorHandlingApiClient {
  private apiClient = inject(ApiClient)

  async getWithRetry(endpoint: string, retries: number = 3) {
    for (let i = 0; i < retries; i++) {
      try {
        return await this.apiClient.get(endpoint)
      } catch (error) {
        if (i === retries - 1) {
          throw error
        }
        console.log(`Retry ${i + 1}/${retries}...`)
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)))
      }
    }
  }
}

const getWithRetrySchema = z.object({
  endpoint: z.string(),
  retries: z.number().default(3),
})

@Command({
  path: 'api:get-retry',
  optionsSchema: getWithRetrySchema,
})
export class ApiGetRetryCommand implements CommandHandler<
  z.infer<typeof getWithRetrySchema>
> {
  private apiClient = inject(ErrorHandlingApiClient)

  async execute(options) {
    try {
      const data = await this.apiClient.getWithRetry(
        options.endpoint,
        options.retries
      )
      console.log(JSON.stringify(data, null, 2))
    } catch (error) {
      console.error('Failed after retries:', error.message)
      process.exit(1)
    }
  }
}
```

## Module Organization

Organize API commands into a module:

```typescript
import { CliModule } from '@navios/commander'
import { ApiGetCommand } from './commands/api-get.command'
import { ApiPostCommand } from './commands/api-post.command'
import { ApiLoginCommand } from './commands/api-login.command'
import { ListUsersCommand } from './commands/list-users.command'
import { ShowUserCommand } from './commands/show-user.command'
import { CreateUserCommand } from './commands/create-user.command'
import { DeleteUserCommand } from './commands/delete-user.command'

@CliModule({
  commands: [
    ApiGetCommand,
    ApiPostCommand,
    ApiLoginCommand,
    ListUsersCommand,
    ShowUserCommand,
    CreateUserCommand,
    DeleteUserCommand,
  ],
})
export class ApiModule {}
```

## Usage Examples

```bash
# Basic API calls
node cli.js api:get --endpoint /users
node cli.js api:get --endpoint /users --format table
node cli.js api:post --endpoint /users --data '{"name":"John","email":"john@example.com"}'

# Authentication
node cli.js api:login --username admin --password secret

# User management
node cli.js user:list
node cli.js user:show --id 123
node cli.js user:create --name "John Doe" --email "john@example.com"
node cli.js user:delete --id 123

# With retry
node cli.js api:get-retry --endpoint /users --retries 5
```

