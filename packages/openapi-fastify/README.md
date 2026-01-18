# @navios/openapi-fastify

Fastify provider for OpenAPI documentation with Scalar UI integration.

This package provides OpenAPI documentation generation for Navios applications running on Fastify, including automatic endpoint discovery, schema conversion, and Scalar UI integration for interactive API documentation.

## Overview

`@navios/openapi-fastify` extends `@navios/openapi` with Fastify-specific integration, providing:

- Scalar UI for interactive API documentation
- Automatic OpenAPI spec generation
- JSON and YAML endpoints for the OpenAPI specification
- Seamless integration with Fastify's plugin system

## Features

- Automatic endpoint discovery from Navios controllers
- Zod schema to OpenAPI schema conversion
- Interactive Scalar UI documentation
- OpenAPI JSON and YAML endpoints
- Customizable themes and configuration
- Support for all endpoint types (standard, multipart, stream)
- Type-safe configuration
- Fastify plugin integration

## Installation

```bash
npm install @navios/openapi @navios/openapi-fastify
```

Or with yarn:

```bash
yarn add @navios/openapi @navios/openapi-fastify
```

## Usage

### Basic Setup

```ts
import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { Module, NaviosFactory } from '@navios/core'
import { defineOpenApiPlugin } from '@navios/openapi-fastify'
import { ApiTag, ApiOperation } from '@navios/openapi'

import { AppModule } from './app.module.js'

async function bootstrap() {
  const app = await NaviosFactory.create(AppModule, {
    adapter: defineFastifyEnvironment(),
  })

  app.usePlugin(
    defineOpenApiPlugin({
      info: {
        title: 'My API',
        version: '1.0.0',
        description: 'API documentation',
      },
    }),
  )

  await app.init()
  await app.listen({ port: 3000 })

  console.log('API docs available at http://localhost:3000/docs')
}

bootstrap()
```

### Complete Example

```ts
import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { builder } from '@navios/builder'
import { Controller, Endpoint, EndpointParams, Module, NaviosFactory } from '@navios/core'
import { defineOpenApiPlugin } from '@navios/openapi-fastify'
import { ApiOperation, ApiTag } from '@navios/openapi'
import { z } from 'zod'

const API = builder()

const userSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
})

export const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

@Controller()
@ApiTag('Users', 'User management operations')
class UserController {
  @Endpoint(getUser)
  @ApiOperation({
    summary: 'Get user by ID',
    description: 'Retrieves a user by their unique identifier.',
  })
  async getUser(params: EndpointParams<typeof getUser>) {
    return {
      id: params.urlParams.userId,
      name: 'John',
      email: 'john@example.com',
    }
  }
}

@Module({ controllers: [UserController] })
class AppModule {}

async function bootstrap() {
  const app = await NaviosFactory.create(AppModule, {
    adapter: defineFastifyEnvironment(),
  })

  app.usePlugin(
    defineOpenApiPlugin({
      info: {
        title: 'User API',
        version: '1.0.0',
      },
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
        },
      },
    }),
  )

  await app.init()
  await app.listen({ port: 3000 })
  console.log('API docs: http://localhost:3000/docs')
}

bootstrap()
```

### Advanced Configuration

```ts
app.usePlugin(
  defineOpenApiPlugin({
    info: {
      title: 'My API',
      version: '1.0.0',
      description: 'Complete API documentation',
      termsOfService: 'https://example.com/terms',
      contact: {
        name: 'API Support',
        url: 'https://example.com/support',
        email: 'support@example.com',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
    },
    servers: [
      { url: 'http://localhost:3000', description: 'Development' },
      { url: 'https://api.example.com', description: 'Production' },
    ],
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
      apiKey: {
        type: 'apiKey',
        in: 'header',
        name: 'X-API-Key',
      },
    },
    security: [{ bearerAuth: [] }], // Global security requirement
    tags: [
      { name: 'Users', description: 'User management' },
      { name: 'Orders', description: 'Order processing' },
    ],
    jsonPath: '/openapi.json',
    yamlPath: '/openapi.yaml',
    docsPath: '/docs',
    scalar: {
      theme: 'purple',
    },
  }),
)
```

## Configuration Options

### Path Configuration

| Option        | Default         | Description                |
| ------------- | --------------- | -------------------------- |
| `jsonPath`    | `/openapi.json` | Path to serve OpenAPI JSON |
| `yamlPath`    | `/openapi.yaml` | Path to serve OpenAPI YAML |
| `docsPath`    | `/docs`         | Path to serve Scalar UI    |
| `disableYaml` | `false`         | Disable YAML endpoint      |

### Scalar Themes

The `scalar.theme` option accepts: `'default'`, `'alternate'`, `'moon'`, `'purple'`, `'solarized'`.

## Decorators

All decorators from `@navios/openapi` are available:

- `@ApiTag` - Group endpoints under tags
- `@ApiOperation` - Full operation metadata
- `@ApiSummary` - Quick summary
- `@ApiDeprecated` - Mark as deprecated
- `@ApiSecurity` - Security requirements
- `@ApiExclude` - Exclude from docs
- `@ApiStream` - Stream endpoint metadata

See [@navios/openapi](../openapi/README.md) for detailed decorator documentation.

## Endpoints

After setup, the following endpoints are automatically available:

- `GET /docs` - Interactive Scalar UI documentation
- `GET /openapi.json` - OpenAPI specification in JSON format
- `GET /openapi.yaml` - OpenAPI specification in YAML format (if enabled)

## Global Prefix Support

The plugin automatically respects Fastify's global prefix configuration:

```ts
const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
})

app.setGlobalPrefix('/api')

app.usePlugin(
  defineOpenApiPlugin({
    info: { title: 'My API', version: '1.0.0' },
  }),
)

// Documentation will be available at:
// - /api/docs
// - /api/openapi.json
// - /api/openapi.yaml
```

## Requirements

- **Runtime**: Node.js 18+
- **Dependencies**:
  - `@navios/adapter-fastify` - Fastify adapter for Navios
  - `@navios/core` - Core Navios framework
  - `@navios/openapi` - Core OpenAPI package
  - `fastify` ^5.0.0 - Fastify web framework
  - `zod` ^3.25.0 || ^4.0.0 - Schema validation

## Features

- **Automatic Discovery**: Discovers all endpoints from your controllers
- **Schema Conversion**: Converts Zod schemas to OpenAPI schemas automatically
- **Interactive UI**: Beautiful Scalar UI for exploring your API
- **Type Safety**: Full TypeScript support with comprehensive types
- **Customizable**: Extensive configuration options
- **Production Ready**: Battle-tested in production environments
- **Fastify Integration**: Seamless integration with Fastify's plugin system

## Examples

For complete working examples, see:

- [OpenAPI Examples](../../examples/openapi/src/main.mts) - Full Fastify example
- [OpenAPI Guide](../../apps/docs/docs/server/guides/openapi.md) - Comprehensive documentation

## Documentation

For complete documentation on using OpenAPI with Navios, see:

- [OpenAPI Guide](../../apps/docs/docs/server/guides/openapi.md)
- [@navios/openapi Core Package](../openapi/README.md)
- [Controllers & Endpoints](../core/docs/controllers.md)

## Comparison with Bun Provider

| Feature     | Fastify Provider | Bun Provider |
| ----------- | ---------------- | ------------ |
| Runtime     | Node.js          | Bun          |
| Performance | High             | Very High    |
| UI          | Scalar           | Scalar       |
| Setup       | Simple           | Simple       |
| Themes      | 5 themes         | 5 themes     |
| Ecosystem   | Rich             | Growing      |

Both providers offer the same features and API - choose based on your runtime environment.
