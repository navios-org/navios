---
sidebar_position: 7
title: OpenAPI Documentation
---

# OpenAPI Documentation

Generate OpenAPI 3.1 documentation with Scalar UI for your Navios application.

## Overview

The `@navios/openapi` package automatically discovers endpoints in your controllers, extracts type information from Zod schemas, and generates OpenAPI documentation. Provider packages add Scalar UI integration for specific runtime environments:

- `@navios/openapi-fastify` - For Fastify applications
- `@navios/openapi-bun` - For Bun applications

## Installation

```bash
# For Fastify applications
npm install @navios/openapi @navios/openapi-fastify

# For Bun applications
npm install @navios/openapi @navios/openapi-bun
```

## Quick Start

The only differences between Fastify and Bun setups are the adapter and OpenAPI plugin imports:

```typescript
// For Fastify:

// For Bun:
import { defineBunEnvironment } from '@navios/adapter-bun'
import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { defineOpenApiPlugin } from '@navios/openapi-bun'
import { defineOpenApiPlugin } from '@navios/openapi-fastify'
```

Here's a complete example:

```typescript
// Choose one:
// import { defineFastifyEnvironment } from '@navios/adapter-fastify'
// import { defineOpenApiPlugin } from '@navios/openapi-fastify'
// OR
// import { defineBunEnvironment } from '@navios/adapter-bun'
// import { defineOpenApiPlugin } from '@navios/openapi-bun'

import { builder } from '@navios/builder'
import {
  Controller,
  Endpoint,
  EndpointParams,
  Module,
  NaviosFactory,
} from '@navios/core'
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
    // Use defineFastifyEnvironment() for Fastify
    // or defineBunEnvironment() for Bun
    adapter: defineFastifyEnvironment(), // or defineBunEnvironment()
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

  await app.listen({ port: 3000 })
  console.log('API docs available at http://localhost:3000/docs')
}

bootstrap()
```

## Decorators

### @ApiTag

Groups endpoints under a tag in the documentation. Can be applied to controllers or individual methods.

```typescript
// Controller-level tag (all endpoints inherit)
@Controller()
@ApiTag('Users', 'User management operations')
class UserController {
  @Endpoint(getUser)
  async getUser() {}

  @Endpoint(createUser)
  async createUser() {}
}

// Method-level tag (per endpoint)
@Controller()
class MixedController {
  @Endpoint(getUser)
  @ApiTag('Users')
  async getUser() {}

  @Endpoint(getOrder)
  @ApiTag('Orders')
  async getOrder() {}
}
```

### @ApiOperation

Provides detailed operation metadata for an endpoint.

```typescript
@Endpoint(getUser)
@ApiOperation({
  summary: 'Get user by ID',
  description: 'Retrieves a user by their unique identifier. Returns 404 if not found.',
  operationId: 'getUserById',
  deprecated: false,
  externalDocs: {
    url: 'https://docs.example.com/users',
    description: 'User API documentation',
  },
})
async getUser(params: EndpointParams<typeof getUser>) {}
```

### @ApiSummary

Shorthand for adding just a summary.

```typescript
@Endpoint(getUser)
@ApiSummary('Get user by ID')
async getUser() {}
```

### @ApiDeprecated

Marks an endpoint as deprecated.

```typescript
@Endpoint(legacyGetUser)
@ApiDeprecated('Use /v2/users/:id instead')
async getLegacyUser() {}
```

### @ApiSecurity

Specifies security requirements for an endpoint.

```typescript
// Require bearer token
@Endpoint(getUser)
@ApiSecurity({ bearerAuth: [] })
async getUser() {}

// Multiple authentication methods
@Endpoint(adminEndpoint)
@ApiSecurity({ bearerAuth: [], apiKey: [] })
async adminAction() {}

// OAuth2 with scopes
@Endpoint(writeUser)
@ApiSecurity({ oauth2: ['users:write', 'users:read'] })
async writeUser() {}
```

### @ApiExclude

Excludes an endpoint from documentation.

```typescript
@Endpoint(healthCheck)
@ApiExclude()
async healthCheck() {
  return { status: 'ok' }
}
```

### @ApiStream

Specifies content type and description for stream endpoints.

```typescript
@Stream(downloadFile)
@ApiStream({
  contentType: 'application/octet-stream',
  description: 'Download file as binary stream',
})
async download(params: StreamParams<typeof downloadFile>, reply: Reply) {
  // Stream implementation
}

@Stream(streamEvents)
@ApiStream({
  contentType: 'text/event-stream',
  description: 'Real-time event stream',
})
async events(params: StreamParams<typeof streamEvents>, reply: Reply) {
  // SSE implementation
}
```

## Plugin Configuration

### Basic Configuration

```typescript
app.usePlugin(
  defineOpenApiPlugin({
    info: {
      title: 'My API',
      version: '1.0.0',
    },
  }),
)
```

### Full Configuration

```typescript
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

### Path Configuration

| Option     | Default         | Description                |
| ---------- | --------------- | -------------------------- |
| `jsonPath` | `/openapi.json` | Path to serve OpenAPI JSON |
| `yamlPath` | `/openapi.yaml` | Path to serve OpenAPI YAML |
| `docsPath` | `/docs`         | Path to serve Scalar UI    |

### Scalar Themes

The `scalar.theme` option accepts: `'default'`, `'alternate'`, `'moon'`, `'purple'`, `'solarized'`.

## Schema Metadata

Add OpenAPI metadata to your Zod schemas using `.meta()`:

```typescript
const userSchema = z
  .object({
    id: z.string().meta({
      openapi: {
        description: 'Unique user identifier',
        example: 'usr_123abc',
      },
    }),
    name: z
      .string()
      .min(1)
      .max(100)
      .meta({
        openapi: {
          description: 'User display name',
          example: 'John Doe',
        },
      }),
    email: z
      .string()
      .email()
      .meta({
        openapi: {
          description: 'User email address',
          example: 'john@example.com',
          format: 'email',
        },
      }),
    role: z.enum(['user', 'admin', 'moderator']).meta({
      openapi: {
        description: 'User role in the system',
        example: 'user',
      },
    }),
  })
  .meta({
    openapi: {
      title: 'User',
      description: 'Represents a user in the system',
    },
  })
```

## Endpoint Types

The OpenAPI generator automatically handles different endpoint types:

### Standard Endpoints

Standard JSON request/response endpoints are documented with `application/json` content type.

### Multipart Endpoints

Multipart endpoints (declared with `API.declareMultipart()`) are documented with `multipart/form-data`:

```typescript
const uploadFile = API.declareMultipart({
  method: 'POST',
  url: '/files',
  requestSchema: z.object({
    file: z.instanceof(File),
    description: z.string().optional(),
  }),
  responseSchema: z.object({
    fileId: z.string(),
    url: z.string(),
  }),
})
```

### Stream Endpoints

Stream endpoints (declared with `API.declareStream()`) use the content type from `@ApiStream`:

```typescript
const downloadFile = API.declareStream({
  method: 'GET',
  url: '/files/$fileId/download',
})

@Stream(downloadFile)
@ApiStream({
  contentType: 'application/octet-stream',
  description: 'Binary file download',
})
async download() {}
```

## Complete Example

```typescript
// Choose one based on your runtime:
// For Fastify:
// import { defineFastifyEnvironment } from '@navios/adapter-fastify'
// import { defineOpenApiPlugin } from '@navios/openapi-fastify'
// For Bun:
// import { defineBunEnvironment } from '@navios/adapter-bun'
// import { defineOpenApiPlugin } from '@navios/openapi-bun'

import { builder } from '@navios/builder'
import {
  Controller,
  Endpoint,
  EndpointParams,
  HttpCode,
  Module,
  NaviosFactory,
} from '@navios/core'
import { inject } from '@navios/di'
import { ApiOperation, ApiSecurity, ApiSummary, ApiTag } from '@navios/openapi'

import { z } from 'zod'

const API = builder()

// Define schemas with OpenAPI metadata
const userSchema = z.object({
  id: z.string().meta({ openapi: { example: 'usr_123' } }),
  name: z.string().meta({ openapi: { example: 'John Doe' } }),
  email: z.string().email(),
})

// Define endpoints
export const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: userSchema,
})

export const createUser = API.declareEndpoint({
  method: 'POST',
  url: '/users',
  requestSchema: userSchema.omit({ id: true }),
  responseSchema: userSchema,
})

// Controller with OpenAPI decorators
@Controller()
@ApiTag('Users', 'User management operations')
class UserController {
  private userService = inject(UserService)

  @Endpoint(getUser)
  @ApiOperation({
    summary: 'Get user by ID',
    description: 'Retrieves a user by their unique identifier.',
  })
  async getUser(params: EndpointParams<typeof getUser>) {
    return this.userService.findById(params.urlParams.userId)
  }

  @Endpoint(createUser)
  @HttpCode(201)
  @ApiSummary('Create new user')
  @ApiSecurity({ bearerAuth: [] })
  async createUser(params: EndpointParams<typeof createUser>) {
    return this.userService.create(params.data)
  }
}

@Module({ controllers: [UserController] })
class AppModule {}

async function bootstrap() {
  const app = await NaviosFactory.create(AppModule, {
    // Use defineFastifyEnvironment() for Fastify
    // or defineBunEnvironment() for Bun
    adapter: defineFastifyEnvironment(), // or defineBunEnvironment()
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

  await app.listen({ port: 3000 })
  console.log('API docs: http://localhost:3000/docs')
}

bootstrap()
```

## Examples

For complete working examples demonstrating both providers, see the [openapi examples](/examples/openapi) directory:

- **Fastify**: Run `yarn start:fastify` to start the Fastify example
- **Bun**: Run `yarn start:bun` to start the Bun example

Both examples demonstrate the same API with comprehensive OpenAPI documentation, including:

- Multiple controllers with tags
- Security schemes
- Schema metadata
- Deprecated endpoints
- Stream and multipart endpoints

## Next Steps

- [Controllers & Endpoints](/docs/server/guides/controllers) - Learn about defining endpoints
- [Streaming](/docs/server/advanced/streaming) - Implement stream endpoints
- [Multipart](/docs/server/advanced/multipart) - Handle file uploads
