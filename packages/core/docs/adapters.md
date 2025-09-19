# Navios HTTP Adapters

This document provides detailed information about Navios HTTP adapters, their implementation, and usage patterns.

## Overview

Navios uses an adapter pattern to provide HTTP server functionality. Adapters are responsible for:

- Binding HTTP requests and responses to Navios's internal format
- Providing server lifecycle management (start, stop, graceful shutdown)
- Handling server-specific features (middleware, plugins, etc.)
- Abstracting runtime-specific implementations

## Adapter Architecture

Each adapter implements the following core interfaces:

### HttpAdapterToken

Provides the main HTTP server functionality:

- Server initialization and configuration
- Request/response handling
- Server lifecycle management

### EndpointAdapterToken

Handles endpoint-specific functionality:

- Route registration
- Request parameter extraction
- Response formatting

### StreamAdapterToken

Manages streaming responses:

- File streaming
- Server-sent events
- Large response handling

### MultipartAdapterToken

Handles multipart requests:

- File uploads
- Form data processing
- Binary data handling

## Available Adapters

### @navios/adapter-fastify

Built on [Fastify](https://www.fastify.io/), providing a robust HTTP server with excellent performance and a rich ecosystem.

#### Installation

```bash
npm install @navios/adapter-fastify fastify
```

#### Basic Usage

```ts
import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { NaviosFactory } from '@navios/core'

const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
})
```

#### Features

- **High Performance**: Fastify is one of the fastest Node.js web frameworks
- **Schema-based Validation**: Built-in JSON Schema validation
- **Rich Ecosystem**: Extensive plugin system
- **TypeScript Support**: Full TypeScript integration
- **Production Ready**: Battle-tested in production environments

#### Fastify-specific Features

##### Hooks Integration

The adapter integrates with Fastify's hook system:

```ts
// Access to underlying Fastify instance (if needed)
const fastifyInstance = app.getServer()

// Add Fastify hooks
fastifyInstance.addHook('preHandler', async (request, reply) => {
  // Custom pre-handler logic
})
```

##### Plugin System

You can register Fastify plugins:

```ts
import fastifyStatic from '@fastify/static'

const fastifyInstance = app.getServer()
await fastifyInstance.register(fastifyStatic, {
  root: path.join(__dirname, 'public'),
  prefix: '/public/',
})
```

#### Configuration Options

```ts
const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment({
    // Fastify server options
    trustProxy: true,
  }),
})
```

### @navios/adapter-bun

Built for [Bun](https://bun.sh/) runtime, providing optimal performance and native integration.

#### Installation

```bash
npm install @navios/adapter-bun
```

#### Basic Usage

```ts
import { defineBunEnvironment } from '@navios/adapter-bun'
import { NaviosFactory } from '@navios/core'

const app = await NaviosFactory.create(AppModule, {
  adapter: defineBunEnvironment(),
})
```

#### Features

- **Native Performance**: Built on Bun's native HTTP server
- **Fast Startup**: Optimized for quick application startup
- **Memory Efficient**: Lower memory footprint
- **Modern Runtime**: Takes advantage of Bun's modern JavaScript features

#### Bun-specific Features

#### Configuration Options

```ts
const app = await NaviosFactory.create(AppModule, {
  adapter: defineBunEnvironment({
    // Bun server options
    development: process.env.NODE_ENV === 'development',
  }),
})
```

## Adapter Comparison

| Feature            | Fastify Adapter        | Bun Adapter |
| ------------------ | ---------------------- | ----------- |
| **Runtime**        | Node.js                | Bun         |
| **Performance**    | High                   | Very High   |
| **Memory Usage**   | Moderate               | Low         |
| **Startup Time**   | Fast                   | Very Fast   |
| **Ecosystem**      | Rich (Fastify plugins) | Growing     |
| **WebSocket**      | Via plugins            | Native      |
| **File Serving**   | Via plugins            | Native      |
| **Production Use** | Mature                 | Emerging    |
| **Community**      | Large                  | Growing     |

## Creating Custom Adapters

To create a custom adapter, implement the required tokens:

```ts
import {
  EndpointAdapterToken,
  HttpAdapterToken,
  MultipartAdapterToken,
  StreamAdapterToken,
} from '@navios/core'

export function defineCustomEnvironment() {
  const httpTokens = new Map([
    [HttpAdapterToken, CustomHttpAdapter],
    [EndpointAdapterToken, CustomEndpointAdapter],
    [StreamAdapterToken, CustomStreamAdapter],
    [MultipartAdapterToken, CustomMultipartAdapter],
  ])

  return { httpTokens }
}
```

### HttpAdapter Implementation

```ts
import { AbstractHttpAdapter } from '@navios/core'
import { Injectable } from '@navios/di'

@Injectable()
export class CustomHttpAdapter extends AbstractHttpAdapter {
  async init() {
    // Initialize your HTTP server
  }

  async listen(options: any) {
    // Start listening for requests
  }

  async close() {
    // Graceful shutdown
  }

  // Implement other required methods...
}
```

## Best Practices

### Adapter Selection

1. **Choose based on runtime**: Use Fastify for Node.js, Bun for Bun runtime
2. **Consider ecosystem needs**: Fastify has more plugins available
3. **Performance requirements**: Bun offers better raw performance
4. **Team expertise**: Consider your team's familiarity with the underlying technology

### Configuration

1. **Environment-specific settings**: Configure adapters differently for dev/prod
2. **Security**: Enable appropriate security features for production
3. **Monitoring**: Set up proper logging and metrics collection
4. **Resource limits**: Configure appropriate timeouts and limits

### Error Handling

1. **Consistent error responses**: Use Navios exceptions for consistent API responses
2. **Logging**: Ensure proper error logging across adapters
3. **Graceful degradation**: Handle adapter-specific errors appropriately

### Performance Optimization

1. **Connection pooling**: Configure appropriate connection limits
2. **Caching**: Use adapter-specific caching when available
3. **Compression**: Enable response compression for better performance
4. **Static files**: Use efficient static file serving strategies

## Troubleshooting

### Common Issues

#### Fastify Adapter

- **Plugin conflicts**: Ensure Fastify plugins are compatible
- **Schema validation**: Check JSON schema definitions for validation errors
- **Memory leaks**: Monitor for unclosed connections or resources

#### Bun Adapter

- **Runtime compatibility**: Ensure code is compatible with Bun runtime
- **Module resolution**: Check import/export statements work with Bun
- **Native features**: Verify Bun-specific features are used correctly

### Debugging

1. **Enable logging**: Use appropriate log levels for debugging
2. **Check adapter health**: Monitor adapter-specific metrics
3. **Validate configuration**: Ensure adapter configuration is correct
4. **Test isolation**: Test adapters in isolation when troubleshooting

## Migration Guide

### From Express to Navios

If migrating from Express, the Fastify adapter provides the most familiar experience:

```ts
// Express-style (before)
app.get('/users/:id', (req, res) => {
  res.json({ id: req.params.id })
})

// Navios with Fastify adapter (after)
@Controller()
export class UserController {
  @Endpoint(getUserEndpoint)
  async getUser(request: EndpointParams<typeof getUserEndpoint>) {
    return { id: request.id }
  }
}
```

### Between Adapters

Switching adapters is straightforward:

1. Update dependencies
2. Change the adapter import and function call
3. Update any adapter-specific configurations
4. Test thoroughly in your specific environment

The rest of your application code remains unchanged due to Navios's adapter abstraction.
