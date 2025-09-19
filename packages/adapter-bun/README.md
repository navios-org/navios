# @navios/adapter-bun

Bun adapter for Navios - a Type-Safe HTTP Server with Zod Validation.

This package provides the Bun runtime adapter for Navios, allowing you to run Navios applications using [Bun's](https://bun.sh/) native HTTP server implementation.

## Overview

**Important**: `@navios/core` requires an HTTP adapter to function as a server. This package provides the Bun implementation. You must install and configure an adapter to use Navios as an HTTP server.

## Limitations

- Bun does not yet support all Node.js APIs, so some third-party libraries may not work as expected.
- WebSocket support is not yet implemented (coming soon).
- No support for CORS middleware out of the box
- No support for configuration of multipart/form-data requests out of the box

## Features

- Native Bun HTTP server implementation
- Optimized performance for Bun runtime
- Fast startup times and low memory usage
- Full TypeScript support
- WebSocket support (coming soon)
- Efficient request/response handling

## Installation

```bash
bun add @navios/adapter-bun @navios/core
```

Or with npm:

```bash
npm install @navios/adapter-bun @navios/core
```

## Usage

### Basic Setup

```ts
import { defineBunEnvironment } from '@navios/adapter-bun'
import { NaviosFactory } from '@navios/core'

import { AppModule } from './app.module.js'

async function bootstrap() {
  const app = await NaviosFactory.create(AppModule, {
    adapter: defineBunEnvironment(), // Required!
  })

  app.setGlobalPrefix('/api')

  await app.init()
  await app.listen({ port: 3000, host: '0.0.0.0' })
}

bootstrap()
```

### Advanced Configuration

````ts
import { defineBunEnvironment } from '@navios/adapter-bun'
import { NaviosFactory } from '@navios/core'

const app = await NaviosFactory.create(AppModule, {
  adapter: defineBunEnvironment({
    // Bun server options
    development: process.env.NODE_ENV === 'development',
  }),
})

### Accessing Bun Server Instance

```ts
// Get access to the underlying Bun server instance if needed
const bunServer = app.getHttpAdapter().getInstance()
````

## Features

- **Native Performance**: Built on Bun's optimized HTTP server implementation
- **Fast Startup**: Optimized for quick application initialization
- **Memory Efficient**: Lower memory footprint compared to Node.js alternatives
- **Type Safety**: Maintains Navios' complete type-safe API
- **Modern Runtime**: Takes advantage of Bun's modern JavaScript features
- **WebSocket Ready**: Prepared for WebSocket support (coming soon)
- **File Operations**: Optimized file serving and handling
- **ESM Native**: Full ES modules support

## Requirements

- **Runtime**: Bun 1.0+
- **Dependencies**:
  - `@navios/core` - Core Navios framework
  - `@navios/di` - Dependency injection (peer dependency)

## When to Use Bun Adapter

Choose the Bun adapter when:

- ✅ Running on Bun runtime
- ✅ Performance is critical
- ✅ Want faster startup times
- ✅ Prefer minimal dependencies
- ✅ Building new applications without legacy constraints
- ✅ Need memory-efficient server implementation

## Comparison with Other Adapters

| Feature      | Bun Adapter | Fastify Adapter  |
| ------------ | ----------- | ---------------- |
| Runtime      | Bun         | Node.js          |
| Performance  | Very High   | High             |
| Memory Usage | Low         | Moderate         |
| Startup Time | Very Fast   | Fast             |
| Ecosystem    | Growing     | Rich             |
| Maturity     | Emerging    | Production Ready |

## Performance Benefits

The Bun adapter provides significant performance benefits:

- **Faster HTTP parsing**: Native Bun HTTP implementation
- **Lower memory usage**: Optimized memory management
- **Faster startup**: Reduced initialization overhead
- **Efficient I/O**: Bun's optimized file and network operations

## Examples

Check out the [examples directory](../../examples/simple-test/src/bun.mts) for complete working examples.

## Documentation

For complete documentation on using Navios with adapters, see:

- [Navios Core Documentation](../core/README.md)
- [Adapter Guide](../core/docs/adapters.md)
- [Quick Start Guide](../core/docs/quick-start.md)

## Migration from Other Adapters

Switching from another adapter to Bun is straightforward:

```ts
// From Fastify adapter

// To Bun adapter
import { defineBunEnvironment } from '@navios/adapter-bun'
import { defineFastifyEnvironment } from '@navios/adapter-fastify'

// Only the adapter configuration changes
const app = await NaviosFactory.create(AppModule, {
  adapter: defineBunEnvironment(), // Changed this line
})
```

Your controllers, services, and application logic remain unchanged.
