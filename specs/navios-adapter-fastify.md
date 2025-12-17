# @navios/adapter-fastify Specification

## Overview

`@navios/adapter-fastify` provides a Fastify-based HTTP adapter for Navios applications. It enables running Navios applications on Node.js using the high-performance Fastify framework.

**Package:** `@navios/adapter-fastify`
**Version:** 0.6.0
**License:** MIT
**Runtime:** Node.js
**Dependencies:** `fastify`, `@navios/core`, `@navios/di`

## Installation

```bash
npm install @navios/adapter-fastify @navios/core @navios/di
```

## Quick Start

```typescript
import { NaviosFactory } from '@navios/core'
import { defineFastifyEnvironment } from '@navios/adapter-fastify'

const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
})

await app.listen({ port: 3000 })
```

---

## API Reference

### defineFastifyEnvironment()

Creates the Fastify adapter environment configuration.

```typescript
import { defineFastifyEnvironment } from '@navios/adapter-fastify'

const environment = defineFastifyEnvironment()

// Use in NaviosFactory
const app = await NaviosFactory.create(AppModule, {
  adapter: environment,
})
```

**Returns:** `NaviosEnvironmentOptions` with Fastify-specific token mappings.

---

### FastifyApplicationOptions

Configuration options for the Fastify server.

```typescript
interface FastifyApplicationOptions extends Omit<FastifyServerOptions, 'logger'> {
  logger?: LoggerService | LogLevel[] | false
}
```

Inherits all Fastify server options:

| Property | Type | Description |
|----------|------|-------------|
| `logger` | `LoggerService \| LogLevel[] \| false` | Navios logger configuration |
| `trustProxy` | `boolean \| string \| number` | Trust proxy headers |
| `bodyLimit` | `number` | Maximum request body size |
| `requestTimeout` | `number` | Request timeout in ms |
| `https` | `object` | HTTPS configuration |
| `http2` | `boolean` | Enable HTTP/2 |
| ... | ... | All other FastifyServerOptions |

---

### FastifyListenOptions

Options for starting the server.

```typescript
interface FastifyListenOptions {
  port?: number
  host?: string
  backlog?: number
  listenTextResolver?: (address: string) => string
}
```

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `port` | `number` | `3000` | Port to listen on |
| `host` | `string` | `'localhost'` | Host to bind to |
| `backlog` | `number` | - | Connection backlog |

---

## Application Methods

### enableCors(options)

Enables CORS using `@fastify/cors`.

```typescript
app.enableCors({
  origin: ['http://localhost:3000', 'https://example.com'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['X-Custom-Header'],
  maxAge: 86400,
})
```

#### FastifyCorsOptions

| Property | Type | Description |
|----------|------|-------------|
| `origin` | `string \| string[] \| boolean \| RegExp` | Allowed origins |
| `methods` | `string[]` | Allowed HTTP methods |
| `credentials` | `boolean` | Allow credentials |
| `allowedHeaders` | `string[]` | Allowed request headers |
| `exposedHeaders` | `string[]` | Exposed response headers |
| `maxAge` | `number` | Preflight cache duration (seconds) |

### enableMultipart(options)

Enables multipart form handling using `@fastify/multipart`.

```typescript
app.enableMultipart({
  limits: {
    fieldNameSize: 100,
    fieldSize: 1000000,
    fields: 10,
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 5,
    headerPairs: 2000,
  },
  attachFieldsToBody: true,
})
```

#### FastifyMultipartOptions

| Property | Type | Description |
|----------|------|-------------|
| `limits.fieldNameSize` | `number` | Max field name size |
| `limits.fieldSize` | `number` | Max field value size |
| `limits.fields` | `number` | Max number of fields |
| `limits.fileSize` | `number` | Max file size |
| `limits.files` | `number` | Max number of files |
| `attachFieldsToBody` | `boolean` | Attach fields to body |

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
  host: '0.0.0.0',
})
console.log(`Server running at ${address}`)
```

### getServer()

Returns the underlying Fastify instance.

```typescript
const fastify = app.getServer()

// Register custom plugin
fastify.register(require('@fastify/helmet'))

// Add custom route
fastify.get('/health', async () => ({ status: 'ok' }))
```

### dispose()

Gracefully shuts down the server.

```typescript
await app.dispose()
```

---

## Injection Tokens

Fastify-specific tokens for dependency injection.

### FastifyRequestToken

Inject the raw Fastify request object.

```typescript
import { FastifyRequestToken } from '@navios/adapter-fastify'
import { inject } from '@navios/di'

@Injectable({ scope: InjectableScope.Request })
class RequestHelper {
  private request = inject(FastifyRequestToken)

  getIp() {
    return this.request.ip
  }

  getHeaders() {
    return this.request.headers
  }
}
```

### FastifyReplyToken

Inject the raw Fastify reply object.

```typescript
import { FastifyReplyToken } from '@navios/adapter-fastify'
import { inject } from '@navios/di'

@Injectable({ scope: InjectableScope.Request })
class ResponseHelper {
  private reply = inject(FastifyReplyToken)

  setCookie(name: string, value: string) {
    this.reply.setCookie(name, value, {
      httpOnly: true,
      secure: true,
    })
  }

  redirect(url: string) {
    this.reply.redirect(url)
  }
}
```

### FastifyServerToken

Inject the Fastify server instance.

```typescript
import { FastifyServerToken } from '@navios/adapter-fastify'
import { inject } from '@navios/di'

@Injectable()
class PluginService {
  private server = inject(FastifyServerToken)

  registerPlugin(plugin: FastifyPluginCallback) {
    this.server.register(plugin)
  }
}
```

### FastifyApplicationServiceToken

Inject the Navios Fastify application service.

```typescript
import { FastifyApplicationServiceToken } from '@navios/adapter-fastify'
import { inject } from '@navios/di'

@Injectable()
class AppService {
  private appService = inject(FastifyApplicationServiceToken)

  async getServerInfo() {
    return {
      listening: this.appService.isListening,
    }
  }
}
```

---

## Handler Adapters

### Endpoint Adapter

Handles standard JSON endpoints with automatic serialization.

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
- Automatic Zod schema validation via `fastify-type-provider-zod`
- Response serialization with status code
- Header management
- Error handling

### Stream Adapter

Handles streaming responses with manual reply control.

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
import { Controller, Stream, StreamParams, Reply } from '@navios/core'
import { streamEvents } from '../../shared/endpoints/events'

@Controller()
class StreamController {
  @Stream(streamEvents)
  async streamEvents(params: StreamParams<typeof streamEvents>, reply: Reply) {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    })

    const interval = setInterval(() => {
      reply.raw.write(`data: ${JSON.stringify({ time: Date.now() })}\n\n`)
    }, 1000)

    reply.raw.on('close', () => {
      clearInterval(interval)
    })
  }
}
```

### Multipart Adapter

Handles multipart form data uploads.

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
    tags: z.array(z.string()).optional(),
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
    const { file, tags } = params.data
    const fileId = await this.storage.save(file)
    return { fileId }
  }
}
```

**Features:**
- Automatic FormData parsing
- File object conversion
- Array field handling
- JSON parsing for text fields

---

## Execution Context

### FastifyExecutionContext

Fastify-specific execution context for guards.

```typescript
interface FastifyExecutionContext extends AbstractExecutionContext {
  getRequest(): FastifyRequest
  getReply(): FastifyReply
}
```

### Usage in Guards

```typescript
@Injectable()
class FastifyGuard implements CanActivate {
  canActivate(context: FastifyExecutionContext) {
    const request = context.getRequest()

    // Access Fastify-specific properties
    const ip = request.ip
    const userAgent = request.headers['user-agent']
    const requestId = request.id

    return true
  }
}
```

---

## Request Lifecycle

Fastify adapter uses Fastify's lifecycle hooks:

```
Request Received
       │
       ▼
   onRequest ─────────┐
       │              │ Creates execution context
       │              │ Creates request context (DI)
       ▼              │
   preHandler ────────┤
       │              │ Runs guards
       ▼              │
    Handler ──────────┤
       │              │ Executes controller method
       ▼              │
   onResponse ────────┘
       │              │ Cleans up request context
       ▼
 Response Sent
```

### Hook Registration

```typescript
// Internal route registration
instance.route({
  method: httpMethod,
  url: url.replaceAll('$', ':'),  // Convert $id to :id format
  onRequest: async (request, reply) => {
    // Setup execution context
  },
  preHandler: async (request, reply) => {
    // Run guards
  },
  handler: async (request, reply) => {
    // Execute endpoint
  },
  onResponse: async (request, reply) => {
    // Cleanup
  },
})
```

---

## URL Parameter Mapping

Navios uses `$paramName` syntax, which is converted to Fastify's `:paramName`:

```typescript
// Endpoint definition with @navios/builder
const getUserPosts = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId/posts/$postId',
  responseSchema: postSchema,
})

// Registered in Fastify as
// GET /users/:userId/posts/:postId
```

---

## Schema Validation

Fastify adapter uses `fastify-type-provider-zod` for schema validation.

Define schemas with `@navios/builder`:

```typescript
// shared/endpoints/users.ts
import { builder } from '@navios/builder'
import { z } from 'zod'

const API = builder()

export const createUser = API.declareEndpoint({
  method: 'POST',
  url: '/users',
  querySchema: z.object({
    notify: z.boolean().optional(),
  }),
  requestSchema: z.object({
    name: z.string().min(1),
    email: z.string().email(),
  }),
  responseSchema: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
  }),
})
```

Validation occurs automatically:
- **Query params:** Validated against `querySchema`
- **Request body:** Validated against `requestSchema`
- **Response:** Validated/serialized against `responseSchema`

---

## Error Handling

### HTTP Exception Handling

```typescript
// Automatic error response
throw new BadRequestException({
  message: 'Validation failed',
  errors: [{ field: 'email', message: 'Invalid email' }],
})

// Response: 400
// { "message": "Validation failed", "errors": [...] }
```

### Custom Error Handler

```typescript
const fastify = app.getServer()

fastify.setErrorHandler((error, request, reply) => {
  if (error instanceof HttpException) {
    reply.status(error.statusCode).send(error.response)
  } else {
    reply.status(500).send({ message: 'Internal server error' })
  }
})
```

### 404 Handler

```typescript
// Automatic 404 handling for unmatched routes
// Response: 404
// { "message": "Route not found", "path": "/unknown" }
```

---

## Logging

### Pino Integration

Fastify adapter wraps Navios logger in Pino-compatible interface:

```typescript
// Navios logger methods mapped to Pino
{
  fatal: (msg) => logger.fatal(msg),
  error: (msg) => logger.error(msg),
  warn: (msg) => logger.warn(msg),
  info: () => {},  // Suppressed to reduce noise
  debug: (msg) => logger.debug(msg),
  trace: (msg) => logger.verbose(msg),
}
```

### Configuration

```typescript
const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
  logger: ['log', 'warn', 'error'],  // Enabled levels
})
```

---

## Advanced Usage

### Accessing Raw Fastify Instance

```typescript
const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
})

const fastify = app.getServer()

// Register plugins
fastify.register(require('@fastify/helmet'))
fastify.register(require('@fastify/rate-limit'), {
  max: 100,
  timeWindow: '1 minute',
})

// Add decorators
fastify.decorateRequest('user', null)

// Add hooks
fastify.addHook('onRequest', async (request) => {
  request.startTime = Date.now()
})
```

### Custom Plugins

```typescript
@Injectable()
class PluginService implements OnServiceInit {
  private server = inject(FastifyServerToken)

  async onServiceInit() {
    await this.server.register(async (instance) => {
      instance.get('/custom', async () => {
        return { custom: true }
      })
    })
  }
}
```

### WebSocket Support

```typescript
import fastifyWebsocket from '@fastify/websocket'

const fastify = app.getServer()

fastify.register(fastifyWebsocket)

fastify.register(async (instance) => {
  instance.get('/ws', { websocket: true }, (socket, request) => {
    socket.on('message', (message) => {
      socket.send(`Echo: ${message}`)
    })
  })
})
```

---

## Performance Considerations

### Body Limits

```typescript
const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment({
    bodyLimit: 10 * 1024 * 1024,  // 10MB
  }),
})
```

### Trust Proxy

```typescript
const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment({
    trustProxy: true,  // For reverse proxy setups
  }),
})
```

### HTTP/2

```typescript
import { readFileSync } from 'fs'

const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment({
    http2: true,
    https: {
      key: readFileSync('./key.pem'),
      cert: readFileSync('./cert.pem'),
    },
  }),
})
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
```

```typescript
// server/main.ts
import { NaviosFactory, Module, Controller, Endpoint, EndpointParams } from '@navios/core'
import { defineFastifyEnvironment, FastifyRequestToken } from '@navios/adapter-fastify'
import { Injectable, inject, InjectableScope } from '@navios/di'
import { hello } from '../shared/endpoints/hello'

// Request-scoped service
@Injectable({ scope: InjectableScope.Request })
class RequestLogger {
  private request = inject(FastifyRequestToken)

  log(message: string) {
    console.log(`[${this.request.id}] ${message}`)
  }
}

// Controller
@Controller()
class HelloController {
  private logger = inject(RequestLogger)

  @Endpoint(hello)
  async hello(params: EndpointParams<typeof hello>) {
    this.logger.log('Processing hello request')
    const greeting = params.params?.greeting || 'Hello'
    return { message: `${greeting}, ${params.urlParams.name}!` }
  }
}

// Module
@Module({
  controllers: [HelloController],
})
class AppModule {}

// Bootstrap
async function main() {
  const app = await NaviosFactory.create(AppModule, {
    adapter: defineFastifyEnvironment({
      trustProxy: true,
    }),
    logger: ['log', 'warn', 'error'],
  })

  app.setGlobalPrefix('/api')
  app.enableCors({ origin: true })

  await app.listen({ port: 3000, host: '0.0.0.0' })
  console.log('Server running on http://localhost:3000')
}

main()
```

---

## Migration from Express

| Express | Fastify Adapter |
|---------|-----------------|
| `app.use(cors())` | `app.enableCors(options)` |
| `app.use(bodyParser.json())` | Built-in |
| `app.use(multer())` | `app.enableMultipart(options)` |
| `req.body` | `params.data` |
| `req.query` | `params.params` |
| `req.params` | `params.urlParams` |
| `res.json()` | Return value |
| `res.status()` | `@HttpCode()` decorator |
