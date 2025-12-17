---
sidebar_position: 1
title: Fastify
---

# Fastify Adapter

`@navios/adapter-fastify` provides a Fastify-based HTTP adapter for Navios applications. It enables running Navios applications on Node.js using the high-performance Fastify framework.

**Package:** `@navios/adapter-fastify`
**License:** MIT
**Runtime:** Node.js

## Installation

```bash
npm install @navios/core @navios/adapter-fastify @navios/builder zod
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

## API Reference

### defineFastifyEnvironment()

Creates the Fastify adapter environment configuration.

```typescript
import { defineFastifyEnvironment } from '@navios/adapter-fastify'

const environment = defineFastifyEnvironment()

const app = await NaviosFactory.create(AppModule, {
  adapter: environment,
})
```

### Application Methods

#### enableCors(options)

Enables CORS using `@fastify/cors`:

```typescript
app.enableCors({
  origin: ['http://localhost:3000', 'https://example.com'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true,
})
```

> **Note:** This method is specific to the Fastify adapter. CORS is not yet supported in the Bun adapter.

#### enableMultipart(options)

Enables multipart form handling using `@fastify/multipart`:

```typescript
app.enableMultipart({
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 5,
  },
})
```

> **Note:** This method is specific to the Fastify adapter. Bun supports multipart natively without configuration.

#### setGlobalPrefix(prefix)

Sets a global route prefix:

```typescript
app.setGlobalPrefix('/api/v1')
```

#### listen(options)

Starts the HTTP server:

```typescript
const address = await app.listen({
  port: 3000,
  host: '0.0.0.0',
})
```

#### getServer()

Returns the underlying Fastify instance:

```typescript
const fastify = app.getServer()

// Register custom plugin
fastify.register(require('@fastify/helmet'))
```

## Injection Tokens

### FastifyRequestToken

Inject the raw Fastify request object:

```typescript
import { FastifyRequestToken } from '@navios/adapter-fastify'
import { inject, InjectableScope, Injectable } from '@navios/di'

@Injectable({ scope: InjectableScope.Request })
class RequestHelper {
  private request = inject(FastifyRequestToken)

  getIp() {
    return this.request.ip
  }
}
```

### FastifyReplyToken

Inject the raw Fastify reply object:

```typescript
import { FastifyReplyToken } from '@navios/adapter-fastify'

@Injectable({ scope: InjectableScope.Request })
class ResponseHelper {
  private reply = inject(FastifyReplyToken)

  setCookie(name: string, value: string) {
    this.reply.setCookie(name, value, {
      httpOnly: true,
      secure: true,
    })
  }
}
```

### FastifyServerToken

Inject the Fastify server instance:

```typescript
import { FastifyServerToken } from '@navios/adapter-fastify'

@Injectable()
class PluginService {
  private server = inject(FastifyServerToken)

  registerPlugin(plugin: FastifyPluginCallback) {
    this.server.register(plugin)
  }
}
```

## Handler Adapters

### Endpoint Adapter

Handles standard JSON endpoints:

```typescript
@Controller()
class UserController {
  @Endpoint(getUser)
  async getUser(params: EndpointParams<typeof getUser>) {
    return { id: params.urlParams.userId, name: 'John' }
  }
}
```

### Stream Adapter

Handles streaming responses:

```typescript
@Controller()
class StreamController {
  @Stream(streamEvents)
  async streamEvents(params: StreamParams<typeof streamEvents>, reply: Reply) {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
    })

    // Write events...
  }
}
```

### Multipart Adapter

Handles file uploads:

```typescript
@Controller()
class FileController {
  @Multipart(uploadFile)
  async upload(params: MultipartParams<typeof uploadFile>) {
    const { file } = params.data
    const fileId = await this.storage.save(file)
    return { fileId }
  }
}
```

## URL Parameter Mapping

Navios uses `$paramName` syntax, which is converted to Fastify's `:paramName`:

```typescript
// Endpoint definition
url: '/users/$userId/posts/$postId'

// Registered in Fastify as
// GET /users/:userId/posts/:postId
```

## Advanced Usage

### Custom Plugins

```typescript
const fastify = app.getServer()

fastify.register(require('@fastify/helmet'))
fastify.register(require('@fastify/rate-limit'), {
  max: 100,
  timeWindow: '1 minute',
})
```
