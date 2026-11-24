---
sidebar_position: 3
---

# HTTP Clients

This recipe shows how to create and manage HTTP clients using dependency injection.

## Basic HTTP Client Factory

```typescript
import { Factory, InjectionToken } from '@navios/di'
import { z } from 'zod'

const httpConfigSchema = z.object({
  baseUrl: z.string().url(),
  timeout: z.number().default(5000),
  headers: z.record(z.string()).optional(),
})

const HTTP_CONFIG_TOKEN = InjectionToken.create<
  HttpClient,
  typeof httpConfigSchema
>('HTTP_CONFIG', httpConfigSchema)

@Factory({ token: HTTP_CONFIG_TOKEN })
class HttpClientFactory {
  create(ctx: FactoryContext, config: z.infer<typeof httpConfigSchema>) {
    return {
      baseUrl: config.baseUrl,
      timeout: config.timeout,
      headers: config.headers || {},

      async get(path: string) {
        const url = `${config.baseUrl}${path}`
        console.log(`GET ${url}`)
        return { data: `Response from ${path}` }
      },

      async post(path: string, data: any) {
        const url = `${config.baseUrl}${path}`
        console.log(`POST ${url}`, data)
        return { data: `Created at ${path}` }
      },
    }
  }
}

// Usage
const httpClient = await container.get(HTTP_CONFIG_TOKEN, {
  baseUrl: 'https://api.example.com',
  timeout: 10000,
  headers: {
    Authorization: 'Bearer token123',
  },
})
```

## Service Using HTTP Client

```typescript
@Injectable()
class ApiService {
  private readonly httpClient = inject(HTTP_CONFIG_TOKEN, {
    baseUrl: 'https://api.example.com',
    timeout: 5000,
  })

  async getUsers() {
    return this.httpClient.get('/users')
  }

  async createUser(userData: any) {
    return this.httpClient.post('/users', userData)
  }
}
```

