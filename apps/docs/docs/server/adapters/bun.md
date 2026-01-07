---
sidebar_position: 2
title: Bun
---

# Bun Adapter

`@navios/adapter-bun` provides a native Bun HTTP adapter for Navios applications. It enables running Navios applications on Bun's high-performance runtime.

**Package:** `@navios/adapter-bun`
**License:** MIT
**Runtime:** Bun

:::caution ES Decorators Support
Bun does not yet fully support ES decorators natively. You'll need to configure a Bun plugin to transpile TypeScript with proper decorator support. See [Common Problems](/server/faq/common-problems#es-decorators-support-in-bun) for the solution.
:::

## Installation

```bash
bun add @navios/core @navios/adapter-bun @navios/builder zod
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

## API Reference

### defineBunEnvironment()

Creates the Bun adapter environment configuration:

```typescript
import { defineBunEnvironment } from '@navios/adapter-bun'

const environment = defineBunEnvironment()

const app = await NaviosFactory.create(AppModule, {
  adapter: environment,
})
```

## Application Methods

### listen(options)

Starts the HTTP server:

```typescript
await app.listen({
  port: 3000,
  hostname: '0.0.0.0',
})
```

### setGlobalPrefix(prefix)

Sets a global route prefix:

```typescript
app.setGlobalPrefix('/api/v1')
```

### getServer()

Returns the underlying Bun server instance:

```typescript
const server = app.getServer()
```

### enableCors(options)

Enables CORS (Cross-Origin Resource Sharing) support:

```typescript
app.enableCors({
  origin: true, // Allow all origins
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['X-Custom-Header'],
  credentials: true,
  maxAge: 86400, // 24 hours
})
```

**CORS Options:**
- `origin`: `string | boolean | RegExp | (string | boolean | RegExp)[] | function` - Configure allowed origins
  - `true` - Allow all origins (reflects request origin)
  - `false` - Disable CORS
  - `string` - Single origin (e.g., `'https://example.com'`)
  - `RegExp` - Pattern matching (e.g., `/^https:\/\/.*\.example\.com$/`)
  - `string[]` - Array of allowed origins
  - `function` - Dynamic origin validation callback
- `methods`: `string[]` - Allowed HTTP methods (defaults to common methods)
- `allowedHeaders`: `string[]` - Allowed request headers
- `exposedHeaders`: `string[]` - Headers exposed to the client
- `credentials`: `boolean` - Allow credentials (cookies, authorization headers)
- `maxAge`: `number` - Preflight cache duration in seconds
- `cacheControl`: `string | number` - Cache-Control header for preflight responses

**Example with dynamic origin validation:**

```typescript
app.enableCors({
  origin: (origin, callback) => {
    // Custom validation logic
    if (origin && origin.endsWith('.example.com')) {
      callback(null, true)
    } else {
      callback(null, false)
    }
  },
  credentials: true,
})
```

### dispose()

Gracefully shuts down the server:

```typescript
await app.dispose()
```

## Native Features

### Multipart / File Uploads

Bun natively supports multipart form data parsing. No additional configuration is needed - just use `@Multipart()` endpoints directly.

### Streaming

For `@Stream()` endpoints, return a `Response` object or `BodyInit` (the first argument for the Response constructor):

```typescript
@Controller()
class StreamController {
  @Stream(streamEvents)
  async streamEvents(params: StreamParams<typeof streamEvents>) {
    // Return a Response object
    return new Response(
      new ReadableStream({
        async start(controller) {
          controller.enqueue('data: hello\n\n')
          controller.enqueue('data: world\n\n')
          controller.close()
        },
      }),
      {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
        },
      }
    )
  }
}
```

### CORS

Full CORS support is now available in the Bun adapter. Use `enableCors()` to configure CORS headers for cross-origin requests:

```typescript
app.enableCors({
  origin: true, // or specify origins
  methods: ['GET', 'POST'],
  credentials: true,
})
```

The adapter automatically:
- Handles preflight (OPTIONS) requests
- Applies CORS headers to all responses (including errors and 404s)
- Validates origin based on your configuration
- Sets appropriate `Vary` headers for cache compatibility

## Performance

Bun adapter leverages Bun's native HTTP server for maximum performance:

- Native HTTP/HTTPS support
- Fast request parsing
- Native multipart support
- Efficient response streaming
- Low memory footprint

## Example

```typescript
import { NaviosFactory, Module, Controller, Endpoint, EndpointParams } from '@navios/core'
import { defineBunEnvironment } from '@navios/adapter-bun'
import { builder } from '@navios/builder'
import { z } from 'zod'

const API = builder()

const hello = API.declareEndpoint({
  method: 'GET',
  url: '/hello/$name',
  responseSchema: z.object({ message: z.string() }),
})

@Controller()
class HelloController {
  @Endpoint(hello)
  async hello(params: EndpointParams<typeof hello>) {
    return { message: `Hello, ${params.urlParams.name}!` }
  }
}

@Module({ controllers: [HelloController] })
class AppModule {}

const app = await NaviosFactory.create(AppModule, {
  adapter: defineBunEnvironment(),
})

await app.listen({ port: 3000 })
console.log('Server running on http://localhost:3000')
```

## When to Use Bun Adapter

Use `@navios/adapter-bun` when:

- Running on Bun runtime
- Maximum performance is required
- Using Bun-specific features
- Building edge/serverless applications
- Need native multipart without plugins

Use `@navios/adapter-fastify` when:

- Running on Node.js
- Need extensive Fastify plugin ecosystem
- Require Node.js-specific features
