# @navios/openapi

Core OpenAPI package for Navios - Automatic OpenAPI 3.1 documentation generation.

This package provides the core functionality for generating OpenAPI documentation from your Navios controllers and endpoints. It automatically discovers endpoints, extracts type information from Zod schemas, and generates comprehensive OpenAPI specifications.

## Overview

`@navios/openapi` is the foundation package that provides decorators and services for OpenAPI documentation. It works with provider packages to add runtime-specific UI integration:

- `@navios/openapi-fastify` - For Fastify applications with Scalar UI
- `@navios/openapi-bun` - For Bun applications with Scalar UI

## Features

- Automatic endpoint discovery from controllers
- Zod schema to OpenAPI schema conversion
- Comprehensive decorator system for API documentation
- Type-safe metadata extraction
- Support for all endpoint types (standard, multipart, stream)
- OpenAPI 3.1 specification generation
- Rich schema metadata support via Zod `.meta()`

## Installation

```bash
npm install @navios/openapi zod
```

Or with yarn:

```bash
yarn add @navios/openapi zod
```

## Usage

### Basic Setup

This package is typically used through provider packages (`@navios/openapi-fastify` or `@navios/openapi-bun`), but you can also use the core services directly:

```ts
import { NaviosFactory } from '@navios/core'
import {
  EndpointScannerService,
  MetadataExtractorService,
  OpenApiGeneratorService,
} from '@navios/openapi'

// Use the services to generate OpenAPI spec programmatically
const generator = await container.get(OpenApiGeneratorService)

const spec = await generator.generate({
  info: {
    title: 'My API',
    version: '1.0.0',
  },
})
```

### Decorators

The package provides decorators to enhance your API documentation:

#### @ApiTag

Groups endpoints under tags in the documentation:

```ts
import { Controller, Endpoint } from '@navios/core'
import { ApiTag } from '@navios/openapi'

@Controller()
@ApiTag('Users', 'User management operations')
class UserController {
  @Endpoint(getUser)
  async getUser() {}
}
```

#### @ApiOperation

Provides detailed operation metadata:

```ts
import { ApiOperation } from '@navios/openapi'

@Endpoint(getUser)
@ApiOperation({
  summary: 'Get user by ID',
  description: 'Retrieves a user by their unique identifier.',
  operationId: 'getUserById',
  deprecated: false,
})
async getUser() {}
```

#### @ApiSummary

Shorthand for adding just a summary:

```ts
import { ApiSummary } from '@navios/openapi'

@Endpoint(getUser)
@ApiSummary('Get user by ID')
async getUser() {}
```

#### @ApiDeprecated

Marks an endpoint as deprecated:

```ts
import { ApiDeprecated } from '@navios/openapi'

@Endpoint(legacyGetUser)
@ApiDeprecated('Use /v2/users/:id instead')
async getLegacyUser() {}
```

#### @ApiSecurity

Specifies security requirements:

```ts
import { ApiSecurity } from '@navios/openapi'

@Endpoint(getUser)
@ApiSecurity({ bearerAuth: [] })
async getUser() {}
```

#### @ApiExclude

Excludes an endpoint from documentation:

```ts
import { ApiExclude } from '@navios/openapi'

@Endpoint(healthCheck)
@ApiExclude()
async healthCheck() {
  return { status: 'ok' }
}
```

#### @ApiStream

Specifies content type for stream endpoints:

```ts
import { ApiStream } from '@navios/openapi'
import { Stream } from '@navios/core'

@Stream(downloadFile)
@ApiStream({
  contentType: 'application/octet-stream',
  description: 'Download file as binary stream',
})
async download() {}
```

### Schema Metadata

Add OpenAPI metadata to your Zod schemas:

```ts
import { z } from 'zod'

const userSchema = z
  .object({
    id: z.string().meta({
      openapi: {
        description: 'Unique user identifier',
        example: 'usr_123abc',
      },
    }),
    name: z.string().meta({
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
  })
  .meta({
    openapi: {
      title: 'User',
      description: 'Represents a user in the system',
    },
  })
```

## API Reference

### Decorators

- `@ApiTag(name: string, description?: string)` - Tag endpoints
- `@ApiOperation(options: ApiOperationOptions)` - Full operation metadata
- `@ApiSummary(summary: string)` - Quick summary
- `@ApiDeprecated(reason?: string)` - Mark as deprecated
- `@ApiSecurity(requirements: ApiSecurityRequirement)` - Security requirements
- `@ApiExclude()` - Exclude from docs
- `@ApiStream(options: ApiStreamOptions)` - Stream endpoint metadata

### Services

- `OpenApiGeneratorService` - Main service for generating OpenAPI specs
- `EndpointScannerService` - Discovers endpoints from controllers
- `MetadataExtractorService` - Extracts decorator metadata
- `SchemaConverterService` - Converts Zod schemas to OpenAPI
- `PathBuilderService` - Builds OpenAPI path items

### Types

- `OpenApiGeneratorOptions` - Options for generating OpenAPI spec
- `OpenApiEndpointMetadata` - Endpoint metadata type
- `ApiOperationOptions` - Options for @ApiOperation decorator
- `ApiSecurityRequirement` - Security requirement type

## Requirements

- **Dependencies**:
  - `@navios/core` - Core Navios framework
  - `zod` ^3.25.0 || ^4.0.0 - Schema validation
- **Peer Dependencies**:
  - `@navios/di` - Dependency injection (for service usage)

## Provider Packages

This core package is used by provider packages that add runtime-specific UI:

- **[@navios/openapi-fastify](../openapi-fastify/README.md)** - Fastify integration with Scalar UI
- **[@navios/openapi-bun](../openapi-bun/README.md)** - Bun integration with Scalar UI

## Examples

For complete working examples, see:

- [OpenAPI Examples](../../examples/openapi) - Full examples for both Fastify and Bun
- [OpenAPI Guide](../../apps/docs/docs/server/guides/openapi.md) - Comprehensive documentation

## Documentation

For complete documentation on using OpenAPI with Navios, see:

- [OpenAPI Guide](../../apps/docs/docs/server/guides/openapi.md)
- [Controllers & Endpoints](../core/docs/controllers.md)
- [Streaming](../core/docs/streaming.md)
- [Multipart](../core/docs/multipart.md)
