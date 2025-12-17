# @navios/adapter-bun Specification

## Overview

`@navios/adapter-bun` provides a Bun-native HTTP adapter for Navios applications. It enables running Navios applications directly on the Bun runtime with optimal performance.

**Package:** `@navios/adapter-bun`
**Version:** 0.6.0
**License:** MIT
**Runtime:** Bun
**Dependencies:** `@navios/core`, `@navios/di`

## Installation

```bash
bun add @navios/adapter-bun @navios/core @navios/di
```

## Quick Start

```typescript
import { NaviosFactory } from '@navios/core'
import { defineBunEnvironment } from '@navios/adapter-bun'

const app = await NaviosFactory.create(AppModule, {
  adapter: defineBunEnvironment(),
})

await app.listen({ port: 3000 })
```

---

## API Reference

### defineBunEnvironment()

Creates the Bun adapter environment configuration.

```typescript
import { defineBunEnvironment } from '@navios/adapter-bun'

const environment = defineBunEnvironment()

// Use in NaviosFactory
const app = await NaviosFactory.create(AppModule, {
  adapter: environment,
})
```

**Returns:** `NaviosEnvironmentOptions` with Bun-specific token mappings.

---

### BunApplicationOptions

Configuration options for the Bun HTTP server.

```typescript
type BunApplicationOptions = Serve.Options<undefined, string> & {
  logger?: LoggerService | LogLevel[] | false
}
```

Inherits Bun's native server options:

| Property | Type | Description |
|----------|------|-------------|
| `logger` | `LoggerService \| LogLevel[] \| false` | Navios logger configuration |
| `port` | `number` | Port number (can also be set in listen) |
| `hostname` | `string` | Hostname to bind |
| `development` | `boolean` | Enable development mode |
| `tls` | `TLSOptions` | TLS/SSL configuration |
| `maxRequestBodySize` | `number` | Maximum request body size |

---

### BunListenOptions

Options for starting the server.

```typescript
interface BunListenOptions {
  port?: number
  hostname?: string
}
```

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `port` | `number` | `3000` | Port to listen on |
| `hostname` | `string` | `'localhost'` | Host to bind to |

---

## Application Methods

### enableCors(options)

**Note:** CORS is not currently implemented in the Bun adapter. This method is a no-op for API compatibility.

```typescript
// No effect currently - implement CORS manually if needed
app.enableCors({ origin: true })
```

### enableMultipart(options)

**Note:** Multipart is handled natively via Bun's FormData API. This method is a no-op.

```typescript
// No effect - multipart works automatically
app.enableMultipart({})
```

### setGlobalPrefix(prefix)

Sets a global route prefix.

```typescript
app.setGlobalPrefix('/api/v1')
// All routes now start with /api/v1
```

### listen(options)

Starts the HTTP server.

```typescript
const address = await app.listen({
  port: 3000,
  hostname: '0.0.0.0',
})
console.log(`Server running at ${address}`)
```

### getServer()

Returns the underlying Bun server instance.

```typescript
const server = app.getServer()

console.log('Connections:', server.pendingRequests)
```

### dispose()

Gracefully shuts down the server.

```typescript
await app.dispose()
```

---

## Injection Tokens

Bun-specific tokens for dependency injection.

### BunRequestToken

Inject the raw Bun request object.

```typescript
import { BunRequestToken } from '@navios/adapter-bun'
import { inject, InjectableScope } from '@navios/di'

@Injectable({ scope: InjectableScope.Request })
class RequestHelper {
  private request = inject(BunRequestToken)

  getUrl() {
    return new URL(this.request.url)
  }

  getHeaders() {
    return Object.fromEntries(this.request.headers)
  }

  async getBody() {
    return this.request.json()
  }
}
```

### BunServerToken

Inject the Bun server instance.

```typescript
import { BunServerToken } from '@navios/adapter-bun'
import { inject } from '@navios/di'

@Injectable()
class ServerService {
  private server = inject(BunServerToken)

  getStats() {
    return {
      pendingRequests: this.server.pendingRequests,
      port: this.server.port,
    }
  }
}
```

### BunApplicationServiceToken

Inject the Navios Bun application service.

```typescript
import { BunApplicationServiceToken } from '@navios/adapter-bun'
import { inject } from '@navios/di'

@Injectable()
class AppService {
  private appService = inject(BunApplicationServiceToken)
}
```

---

## Handler Adapters

### Endpoint Adapter

Handles standard JSON endpoints returning `Response` objects.

```typescript
// shared/endpoints/users.ts
import { builder } from '@navios/builder'

const API = builder()

export const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})
```

```typescript
// server/controllers/user.controller.ts
import { Controller, Endpoint, EndpointParams } from '@navios/core'
import { getUser } from '../../shared/endpoints/users'

@Controller()
class UserController {
  @Endpoint(getUser)
  async getUser(params: EndpointParams<typeof getUser>) {
    return { id: params.urlParams.userId, name: 'John' }
  }
}
```

**Features:**
- Returns JSON Response automatically
- Zod schema validation
- Status code and header support

### Stream Adapter

Handles streaming responses using Bun's Response API.

```typescript
// shared/endpoints/events.ts
import { builder } from '@navios/builder'

const API = builder()

export const streamEvents = API.declareStream({
  method: 'GET',
  url: '/events',
})
```

```typescript
// server/controllers/stream.controller.ts
import { Controller, Stream, StreamParams } from '@navios/core'
import { streamEvents } from '../../shared/endpoints/events'

@Controller()
class StreamController {
  @Stream(streamEvents)
  async streamEvents(params: StreamParams<typeof streamEvents>) {
    const stream = new ReadableStream({
      start(controller) {
        const interval = setInterval(() => {
          const data = `data: ${JSON.stringify({ time: Date.now() })}\n\n`
          controller.enqueue(new TextEncoder().encode(data))
        }, 1000)

        // Cleanup on abort
        return () => clearInterval(interval)
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
      },
    })
  }
}
```

**Note:** Stream handlers in Bun return `Response` objects directly rather than receiving a reply parameter.

### Multipart Adapter

Handles multipart form data using Bun's native FormData API.

```typescript
// shared/endpoints/files.ts
import { builder } from '@navios/builder'
import { z } from 'zod'

const API = builder()

export const uploadFile = API.declareMultipart({
  method: 'POST',
  url: '/upload',
  requestSchema: z.object({
    file: z.instanceof(File),
    name: z.string(),
  }),
  responseSchema: z.object({ fileId: z.string() }),
})
```

```typescript
// server/controllers/file.controller.ts
import { Controller, Multipart, MultipartParams } from '@navios/core'
import { uploadFile } from '../../shared/endpoints/files'

@Controller()
class FileController {
  @Multipart(uploadFile)
  async upload(params: MultipartParams<typeof uploadFile>) {
    const { file, name } = params.data
    const buffer = await file.arrayBuffer()
    const fileId = await this.storage.save(buffer, name)
    return { fileId }
  }
}
```

**Features:**
- Native Bun FormData parsing
- File object handling
- Automatic array field support

---

## Execution Context

### BunExecutionContext

Bun-specific execution context for guards.

```typescript
interface BunExecutionContext extends AbstractExecutionContext {
  getRequest(): BunRequest
  getReply(): never  // Throws - Bun doesn't have reply object
}
```

### Usage in Guards

```typescript
@Injectable()
class BunGuard implements CanActivate {
  canActivate(context: BunExecutionContext) {
    const request = context.getRequest()

    // Access Bun request properties
    const url = new URL(request.url)
    const authHeader = request.headers.get('authorization')

    return !!authHeader
  }
}
```

**Note:** `getReply()` throws an error in Bun adapter since responses are returned directly from handlers.

---

## Request Lifecycle

Bun adapter uses a simpler request lifecycle:

```
Request Received
       │
       ▼
 Create Request ID ────┐
       │               │ crypto.randomUUID()
       ▼               │
 Begin Request Context │ DI request scope
       │               │
       ▼               │
   Run Guards ─────────┤
       │               │ Check canActivate
       ▼               │
  Execute Handler ─────┤
       │               │ Call controller method
       ▼               │
  Error Handler ───────┤
       │               │ Convert to Response
       ▼               │
 End Request Context ──┘
       │               │ Cleanup DI scope
       ▼
 Return Response
```

### Request ID Generation

```typescript
const requestId = crypto.randomUUID()
```

Unlike Fastify, Bun doesn't have built-in request IDs, so the adapter generates UUIDs.

---

## URL Parameter Handling

The Bun adapter processes URL parameters from the route pattern:

```typescript
// Endpoint definition with @navios/builder
const getUserPosts = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId/posts/$postId',
  responseSchema: postSchema,
})

// Parameters extracted via pattern matching
// { userId: 'abc', postId: '123' }
```

---

## Response Handling

### JSON Responses

All endpoint handlers return plain objects that are automatically serialized:

```typescript
@Endpoint(someEndpoint)
async handler(params: EndpointParams<typeof someEndpoint>) {
  return { data: 'value' }  // Becomes Response with JSON body
}
```

### Custom Responses

For full control, return a `Response` object:

```typescript
@Stream(config)
async customResponse(params) {
  return new Response(JSON.stringify({ custom: true }), {
    status: 201,
    headers: {
      'Content-Type': 'application/json',
      'X-Custom-Header': 'value',
    },
  })
}
```

### Streaming Responses

```typescript
@Stream(config)
async streamResponse(params) {
  const stream = new ReadableStream({
    async pull(controller) {
      for await (const chunk of dataSource) {
        controller.enqueue(chunk)
      }
      controller.close()
    },
  })

  return new Response(stream)
}
```

---

## Error Handling

### HTTP Exception Handling

Errors are caught and converted to Response objects:

```typescript
// In handler
throw new BadRequestException('Invalid input')

// Becomes Response:
// Status: 400
// Body: { "message": "Invalid input", "statusCode": 400 }
```

### Error Response Format

```typescript
// HttpException
new Response(JSON.stringify({
  message: exception.message,
  statusCode: exception.statusCode,
  ...exception.response,
}), {
  status: exception.statusCode,
  headers: { 'Content-Type': 'application/json' },
})

// Unknown errors
new Response(JSON.stringify({
  message: 'Internal server error',
  statusCode: 500,
}), {
  status: 500,
  headers: { 'Content-Type': 'application/json' },
})
```

### Guard Rejection

When a guard returns `false`:

```typescript
// Response: 403 Forbidden
new Response(JSON.stringify({
  message: 'Forbidden',
  statusCode: 403,
}), {
  status: 403,
  headers: { 'Content-Type': 'application/json' },
})
```

---

## Schema Validation

The Bun adapter performs manual Zod validation:

### Query Parameters

```typescript
const url = new URL(request.url)
const queryParams = Object.fromEntries(url.searchParams)
const validated = querySchema.parse(queryParams)
```

### Request Body

```typescript
const body = await request.json()
const validated = requestSchema.parse(body)
```

### Validation Errors

Zod validation errors are converted to BadRequestException automatically.

---

## Differences from Fastify Adapter

| Feature | Fastify Adapter | Bun Adapter |
|---------|-----------------|-------------|
| **Runtime** | Node.js | Bun |
| **Request Type** | FastifyRequest | Request (Web API) |
| **Response Type** | FastifyReply | Response (Web API) |
| **Handler Return** | void (uses reply) | Response |
| **CORS Support** | @fastify/cors | Not built-in |
| **Multipart** | @fastify/multipart | Native FormData |
| **Request ID** | Built-in | crypto.randomUUID() |
| **Schema Validation** | fastify-type-provider-zod | Manual Zod |
| **Error Handler** | setErrorHandler hook | Per-handler try-catch |
| **Reply in Stream** | Yes | No (return Response) |

---

## Performance Optimization

### Request Body Size

```typescript
const app = await NaviosFactory.create(AppModule, {
  adapter: defineBunEnvironment({
    maxRequestBodySize: 50 * 1024 * 1024,  // 50MB
  }),
})
```

### TLS/HTTPS

```typescript
const app = await NaviosFactory.create(AppModule, {
  adapter: defineBunEnvironment({
    tls: {
      key: Bun.file('./key.pem'),
      cert: Bun.file('./cert.pem'),
    },
  }),
})
```

### Development Mode

```typescript
const app = await NaviosFactory.create(AppModule, {
  adapter: defineBunEnvironment({
    development: process.env.NODE_ENV !== 'production',
  }),
})
```

---

## Native Bun Features

### File Serving

```typescript
// shared/endpoints/files.ts
export const serveFile = API.declareStream({
  method: 'GET',
  url: '/files/$filename',
})
```

```typescript
// server/controllers/file.controller.ts
@Stream(serveFile)
async serveFile(params: StreamParams<typeof serveFile>) {
  const file = Bun.file(`./uploads/${params.urlParams.filename}`)

  if (!await file.exists()) {
    throw new NotFoundException('File not found')
  }

  return new Response(file)
}
```

### WebSocket Support

WebSockets require direct Bun server configuration:

```typescript
const app = await NaviosFactory.create(AppModule, {
  adapter: defineBunEnvironment(),
})

// Access underlying server for WebSocket
const server = app.getServer()

// Note: WebSocket support requires custom implementation
// as Navios doesn't have built-in WebSocket decorators
```

### SQLite Integration

```typescript
import { Database } from 'bun:sqlite'

@Injectable()
class DatabaseService {
  private db = new Database('./app.db')

  query(sql: string, params: any[]) {
    return this.db.query(sql).all(...params)
  }
}
```

---

## Complete Example

```typescript
// shared/endpoints/hello.ts - Shared between client and server
import { builder } from '@navios/builder'
import { z } from 'zod'

export const API = builder()

export const hello = API.declareEndpoint({
  method: 'GET',
  url: '/hello/$name',
  querySchema: z.object({ greeting: z.string().optional() }),
  responseSchema: z.object({ message: z.string() }),
})

export const streamEvents = API.declareStream({
  method: 'GET',
  url: '/events',
})
```

```typescript
// server/main.ts
import { NaviosFactory, Module, Controller, Endpoint, Stream, EndpointParams, StreamParams } from '@navios/core'
import { defineBunEnvironment, BunRequestToken } from '@navios/adapter-bun'
import { Injectable, inject, InjectableScope } from '@navios/di'
import { hello, streamEvents } from '../shared/endpoints/hello'

// Request-scoped service
@Injectable({ scope: InjectableScope.Request })
class RequestLogger {
  private request = inject(BunRequestToken)

  log(message: string) {
    const url = new URL(this.request.url)
    console.log(`[${url.pathname}] ${message}`)
  }
}

// Controller
@Controller()
class AppController {
  private logger = inject(RequestLogger)

  @Endpoint(hello)
  async hello(params: EndpointParams<typeof hello>) {
    this.logger.log('Processing hello request')
    const greeting = params.params?.greeting || 'Hello'
    return { message: `${greeting}, ${params.urlParams.name}!` }
  }

  @Stream(streamEvents)
  async events(params: StreamParams<typeof streamEvents>) {
    let count = 0
    const stream = new ReadableStream({
      start(controller) {
        const interval = setInterval(() => {
          count++
          const data = `data: ${JSON.stringify({ count, time: Date.now() })}\n\n`
          controller.enqueue(new TextEncoder().encode(data))

          if (count >= 10) {
            clearInterval(interval)
            controller.close()
          }
        }, 1000)
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })
  }
}

// Module
@Module({
  controllers: [AppController],
})
class AppModule {}

// Bootstrap
async function main() {
  const app = await NaviosFactory.create(AppModule, {
    adapter: defineBunEnvironment({
      development: true,
    }),
    logger: ['log', 'warn', 'error'],
  })

  app.setGlobalPrefix('/api')

  await app.listen({ port: 3000, hostname: '0.0.0.0' })
  console.log('Bun server running on http://localhost:3000')
}

main()
```

---

## Migration from Node.js/Fastify

### Request Handling

```typescript
// Fastify
const ip = request.ip
const headers = request.headers

// Bun
const url = new URL(request.url)
const headers = Object.fromEntries(request.headers)
```

### Response Handling

```typescript
// Fastify (in stream handler)
reply.header('Content-Type', 'text/plain')
reply.send('Hello')

// Bun (return Response)
return new Response('Hello', {
  headers: { 'Content-Type': 'text/plain' },
})
```

### File Handling

```typescript
// Fastify with @fastify/multipart
const data = await request.file()
const buffer = await data.toBuffer()

// Bun native
const formData = await request.formData()
const file = formData.get('file') as File
const buffer = await file.arrayBuffer()
```

---

## Limitations

1. **No CORS built-in** - Implement CORS headers manually if needed
2. **No Reply object** - Stream handlers return Response directly
3. **No WebSocket decorators** - WebSocket requires manual setup
4. **No request.id** - UUID generated per request instead

## Bun-Specific Benefits

1. **Faster startup** - Bun's faster runtime initialization
2. **Native TypeScript** - No compilation step needed
3. **Built-in APIs** - File, SQLite, crypto all native
4. **Lower memory** - More efficient memory usage
5. **Simpler FormData** - Native Web API support
