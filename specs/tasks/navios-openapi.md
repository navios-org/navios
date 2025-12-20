# @navios/openapi Implementation Plan

## Overview

Create a new library `@navios/openapi` that adds OpenAPI/Swagger documentation support to `@navios/core`. The library will automatically discover endpoints in controllers, extract type information from Zod schemas, and generate OpenAPI 3.1 documentation with Scalar UI integration.

**Package:** `@navios/openapi`
**Dependencies:** `@navios/core`, `@navios/di`, `zod-openapi`, `yaml`
**UI Integration:** Scalar (via adapter-specific plugins)

---

## Scope Summary

This task involves changes to **3 packages**:

| Package | Type | Description |
|---------|------|-------------|
| `@navios/core` | Modify | Add plugin system (`usePlugin` API) |
| `@navios/openapi` | New | Core OpenAPI generation, decorators, schema conversion |
| `@navios/openapi-fastify` | New | Fastify-specific integration with Scalar UI |

### Prerequisites (changes to existing packages)

Before implementing the OpenAPI packages, we need to add a plugin system to `@navios/core`:
- Add `NaviosPlugin` interface and `PluginContext` type
- Add `usePlugin()` method to `NaviosApplication`
- Add `getGlobalPrefix()` to adapter interface
- Update both Fastify and Bun adapters

---

## Architecture

```
@navios/openapi (core)
├── Schema conversion (Zod → OpenAPI)
├── Endpoint discovery
├── Document generation
├── Decorators (metadata)
└── Abstract UI integration

@navios/openapi-fastify (adapter plugin)
├── Scalar UI integration (@scalar/fastify-api-reference)
├── Route registration for /openapi.json
└── Route registration for /docs (Scalar UI)

@navios/openapi-bun (adapter plugin - future)
├── Scalar UI integration (HTML-based)
└── Route handlers for Bun
```

---

## Phase 0: Core Infrastructure (@navios/core changes)

### 0.1 Problem Statement

Currently, `NaviosApplication` doesn't have a plugin system. To integrate OpenAPI documentation, we need a way to:
1. Register plugins that can access the loaded modules metadata
2. Allow plugins to register routes on the underlying server
3. Maintain adapter-agnostic plugin interface with adapter-specific implementations

### 0.2 Plugin Interface Design

Add plugin support to `@navios/core`:

```typescript
// packages/core/src/interfaces/plugin.interface.mts

import type { ModuleMetadata } from '../metadata/index.mjs'

/**
 * Context provided to plugins during registration
 */
export interface PluginContext {
  /**
   * All loaded modules with their metadata
   */
  modules: Map<string, ModuleMetadata>

  /**
   * The underlying HTTP server instance (Fastify, Bun, etc.)
   */
  server: any

  /**
   * The DI container
   */
  container: Container

  /**
   * Global route prefix (e.g., '/api')
   */
  globalPrefix: string
}

/**
 * Base interface for Navios plugins
 */
export interface NaviosPlugin<TOptions = unknown> {
  /**
   * Plugin name for identification
   */
  name: string

  /**
   * Called after modules are loaded but before server starts listening
   */
  register(context: PluginContext, options: TOptions): Promise<void> | void
}

/**
 * Plugin definition with options
 */
export interface PluginDefinition<TOptions = unknown> {
  plugin: NaviosPlugin<TOptions>
  options: TOptions
}
```

### 0.3 NaviosApplication Changes

Add `usePlugin` method to `NaviosApplication`:

```typescript
// In packages/core/src/navios.application.mts

export class NaviosApplication {
  // ... existing code ...

  private plugins: PluginDefinition<any>[] = []

  /**
   * Registers a plugin to be initialized after modules are loaded.
   *
   * Plugins are initialized in the order they are registered,
   * after all modules are loaded but before the server starts listening.
   *
   * @param plugin - Plugin definition with options
   * @returns this for method chaining
   *
   * @example
   * ```typescript
   * import { defineOpenApiPlugin } from '@navios/openapi-fastify'
   *
   * app.usePlugin(defineOpenApiPlugin({
   *   info: { title: 'My API', version: '1.0.0' },
   * }))
   * ```
   */
  usePlugin<TOptions>(definition: PluginDefinition<TOptions>): this {
    this.plugins.push(definition)
    return this
  }

  /**
   * Updated init method to include plugin initialization
   */
  async init() {
    if (!this.appModule) {
      throw new Error('App module is not set. Call setAppModule() first.')
    }
    await this.moduleLoader.loadModules(this.appModule)
    if (this.environment.hasHttpSetup()) {
      await this.httpApplication?.setupHttpServer(this.options)
    }
    await this.initModules()

    // Initialize plugins after modules but before ready()
    await this.initPlugins()

    if (this.environment.hasHttpSetup()) {
      await this.httpApplication?.ready()
    }

    this.isInitialized = true
    this.logger.debug('Navios application initialized')
  }

  private async initPlugins() {
    if (this.plugins.length === 0) return

    const context: PluginContext = {
      modules: this.moduleLoader.getAllModules(),
      server: this.httpApplication?.getServer(),
      container: this.container,
      globalPrefix: this.httpApplication?.getGlobalPrefix() ?? '',
    }

    for (const { plugin, options } of this.plugins) {
      this.logger.debug(`Initializing plugin: ${plugin.name}`)
      await plugin.register(context, options)
    }
  }
}
```

### 0.4 Abstract Adapter Interface Update

Add `getGlobalPrefix` to the adapter interface:

```typescript
// In packages/core/src/interfaces/abstract-http-adapter.interface.mts

export interface AbstractHttpAdapterInterface<...> {
  // ... existing methods ...

  /**
   * Gets the current global prefix
   */
  getGlobalPrefix(): string
}
```

### 0.5 Files to Modify in @navios/core

| File | Change |
|------|--------|
| `src/interfaces/plugin.interface.mts` | New file - plugin interfaces |
| `src/interfaces/index.mts` | Export plugin interfaces |
| `src/navios.application.mts` | Add `usePlugin`, `initPlugins`, plugin storage |
| `src/interfaces/abstract-http-adapter.interface.mts` | Add `getGlobalPrefix` method |
| `src/index.mts` | Export plugin types |

### 0.6 Alternative: Direct Server Access (No Core Changes)

If we want to avoid modifying `@navios/core`, plugins can use `getServer()` directly:

```typescript
// This works today without any core changes
const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
})

await app.init()

// Access Fastify instance directly
const fastify = app.getServer()

// Register OpenAPI plugin manually
await fastify.register(openApiPlugin, {
  modules: app.getContainer().get(ModuleLoaderService).getAllModules(),
  // ... options
})

await app.listen({ port: 3000 })
```

**Recommendation:** Implement the `usePlugin` API for better DX and consistency, but document the direct server access as an alternative for advanced users.

---

## Phase 1: Core Package (@navios/openapi)

### 1.1 Package Setup

Create package structure:
```
packages/openapi/
├── src/
│   ├── index.mts                     # Public exports
│   ├── decorators/
│   │   ├── index.mts
│   │   ├── api-operation.decorator.mts   # @ApiOperation - endpoint description
│   │   ├── api-tag.decorator.mts         # @ApiTag - grouping/folder
│   │   ├── api-summary.decorator.mts     # @ApiSummary - short description
│   │   ├── api-deprecated.decorator.mts  # @ApiDeprecated - mark deprecated
│   │   ├── api-security.decorator.mts    # @ApiSecurity - security requirements
│   │   ├── api-exclude.decorator.mts     # @ApiExclude - hide from docs
│   │   └── api-stream.decorator.mts      # @ApiStream - stream content type
│   ├── generators/
│   │   ├── index.mts
│   │   ├── openapi-generator.mts         # Main document generator
│   │   ├── schema-generator.mts          # Zod to OpenAPI schema
│   │   ├── path-generator.mts            # Endpoint to path item
│   │   └── parameter-generator.mts       # URL/query params
│   ├── discovery/
│   │   ├── index.mts
│   │   └── endpoint-scanner.mts          # Scans modules for endpoints
│   ├── metadata/
│   │   ├── index.mts
│   │   └── openapi.metadata.mts          # Metadata storage/retrieval
│   ├── interfaces/
│   │   ├── index.mts
│   │   ├── openapi-options.interface.mts
│   │   └── openapi-document.interface.mts
│   ├── tokens/
│   │   ├── index.mts
│   │   └── openapi.tokens.mts
│   └── services/
│       ├── index.mts
│       └── openapi.service.mts           # Main service for doc generation
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

### 1.2 Decorators Implementation

#### @ApiTag(name, description?)
Groups endpoints under a specific tag/folder in the documentation.

```typescript
// Can be applied to controller (all endpoints) or individual methods
@Controller()
@ApiTag('Users', 'User management operations')
export class UserController {
  @Endpoint(getUser)
  async getUser(params: EndpointParams<typeof getUser>) {}
}

// Or per-endpoint
@Controller()
export class MixedController {
  @Endpoint(getUser)
  @ApiTag('Users')
  async getUser() {}

  @Endpoint(getOrder)
  @ApiTag('Orders')
  async getOrder() {}
}
```

#### @ApiOperation(options)
Provides detailed operation metadata.

```typescript
interface ApiOperationOptions {
  summary?: string          // Short summary (shown in list)
  description?: string      // Detailed description (markdown supported)
  operationId?: string      // Unique operation identifier
  deprecated?: boolean      // Mark as deprecated
  externalDocs?: {          // Link to external documentation
    url: string
    description?: string
  }
}

@Controller()
export class UserController {
  @Endpoint(getUser)
  @ApiOperation({
    summary: 'Get user by ID',
    description: 'Retrieves a user by their unique identifier. Returns 404 if not found.',
    operationId: 'getUserById',
  })
  async getUser(params: EndpointParams<typeof getUser>) {}
}
```

#### @ApiSummary(summary)
Shorthand for adding just a summary.

```typescript
@Endpoint(getUser)
@ApiSummary('Get user by ID')
async getUser() {}
```

#### @ApiDeprecated(message?)
Marks an endpoint as deprecated.

```typescript
@Endpoint(legacyGetUser)
@ApiDeprecated('Use /v2/users/:id instead')
async getLegacyUser() {}
```

#### @ApiSecurity(requirements)
Specifies security requirements for an endpoint.

```typescript
@Endpoint(getUser)
@ApiSecurity({ bearerAuth: [] })
async getUser() {}

// Multiple schemes
@Endpoint(adminEndpoint)
@ApiSecurity({ bearerAuth: [], apiKey: [] })
async adminAction() {}
```

#### @ApiExclude()
Excludes an endpoint from documentation.

```typescript
@Endpoint(internalHealthCheck)
@ApiExclude()
async healthCheck() {}
```

### 1.3 OpenAPI Generator Service

The main service that orchestrates document generation:

```typescript
@Injectable()
class OpenApiGeneratorService {
  constructor() {}

  /**
   * Generate OpenAPI document from loaded modules
   */
  generate(options: OpenApiGeneratorOptions): OpenAPIObject {
    // 1. Scan all modules for controllers and endpoints
    // 2. Extract metadata from decorators
    // 3. Convert Zod schemas to OpenAPI schemas
    // 4. Build paths object
    // 5. Return complete OpenAPI document
  }
}
```

### 1.4 Schema Conversion (Zod → OpenAPI)

Use `zod-openapi` for schema conversion. The library uses Zod 4's native `.meta()` method:

```typescript
import { createSchema } from 'zod-openapi'

// In endpoint config, schemas can have OpenAPI metadata
const userSchema = z.object({
  id: z.string().meta({
    openapi: { description: 'Unique user identifier', example: 'usr_123' }
  }),
  name: z.string().meta({
    openapi: { description: 'Full name', example: 'John Doe' }
  }),
  email: z.string().email().meta({
    openapi: { description: 'Email address', example: 'john@example.com' }
  }),
})

// Schema generator converts this to OpenAPI schema
function zodToOpenApiSchema(schema: ZodType): SchemaObject {
  return createSchema(schema)
}
```

### 1.5 Endpoint Discovery

Scan loaded modules to discover all endpoints:

```typescript
interface DiscoveredEndpoint {
  controller: ControllerMetadata
  handler: HandlerMetadata
  module: ModuleMetadata
  config: BaseEndpointConfig
  openApiMetadata: {
    tags: string[]
    summary?: string
    description?: string
    deprecated?: boolean
    security?: SecurityRequirement[]
    excluded?: boolean
  }
}

class EndpointScanner {
  /**
   * Scans all loaded modules and returns discovered endpoints
   */
  scan(modules: Map<string, ModuleMetadata>): DiscoveredEndpoint[] {
    const endpoints: DiscoveredEndpoint[] = []

    for (const [, moduleMetadata] of modules) {
      for (const controller of moduleMetadata.controllers) {
        const controllerMeta = extractControllerMetadata(controller)

        for (const handler of controllerMeta.endpoints) {
          // Skip if @ApiExclude is present
          if (this.isExcluded(handler)) continue

          endpoints.push({
            controller: controllerMeta,
            handler,
            module: moduleMetadata,
            config: handler.config,
            openApiMetadata: this.extractOpenApiMetadata(controllerMeta, handler),
          })
        }
      }
    }

    return endpoints
  }
}
```

### 1.6 Path Generation

Convert endpoints to OpenAPI path items:

```typescript
class PathGenerator {
  generatePath(endpoint: DiscoveredEndpoint): PathItemObject {
    const { config, openApiMetadata, handler } = endpoint

    // Convert $param to {param} format for OpenAPI
    const path = config.url.replaceAll(/\$(\w+)/g, '{$1}')

    const operation: OperationObject = {
      tags: openApiMetadata.tags,
      summary: openApiMetadata.summary,
      description: openApiMetadata.description,
      deprecated: openApiMetadata.deprecated,
      security: openApiMetadata.security,
      parameters: this.generateParameters(config),
      requestBody: this.generateRequestBody(config, handler),
      responses: this.generateResponses(config, handler),
    }

    return { [config.method.toLowerCase()]: operation }
  }

  private generateParameters(config: BaseEndpointConfig): ParameterObject[] {
    const params: ParameterObject[] = []

    // URL parameters (from $paramName in URL)
    const urlParams = this.extractUrlParams(config.url)
    for (const param of urlParams) {
      params.push({
        name: param,
        in: 'path',
        required: true,
        schema: { type: 'string' },
      })
    }

    // Query parameters (from querySchema)
    if (config.querySchema) {
      const querySchema = zodToOpenApiSchema(config.querySchema)
      // Convert object properties to individual query params
      for (const [name, schema] of Object.entries(querySchema.properties || {})) {
        params.push({
          name,
          in: 'query',
          required: querySchema.required?.includes(name) ?? false,
          schema,
        })
      }
    }

    return params
  }
}
```

### 1.7 Multipart Endpoint Handling

Multipart endpoints (declared with `API.declareMultipart()`) require special handling for OpenAPI:

```typescript
class MultipartPathGenerator {
  /**
   * Detect multipart endpoints by checking the adapter token
   */
  isMultipart(handler: HandlerMetadata): boolean {
    return handler.adapterToken === MultipartAdapterToken
  }

  /**
   * Generate request body for multipart endpoints
   */
  generateMultipartRequestBody(config: BaseEndpointConfig): RequestBodyObject {
    const schema = config.requestSchema
      ? zodToOpenApiSchema(config.requestSchema)
      : { type: 'object' }

    // Transform schema properties to handle File types
    const properties = this.transformFileProperties(schema.properties || {})

    return {
      required: true,
      content: {
        'multipart/form-data': {
          schema: {
            type: 'object',
            properties,
            required: schema.required,
          },
        },
      },
    }
  }

  /**
   * Convert File/Blob types to OpenAPI binary format
   */
  private transformFileProperties(
    properties: Record<string, SchemaObject>
  ): Record<string, SchemaObject> {
    const result: Record<string, SchemaObject> = {}

    for (const [key, prop] of Object.entries(properties)) {
      // Detect z.instanceof(File) or z.instanceof(Blob)
      if (this.isFileType(prop)) {
        result[key] = {
          type: 'string',
          format: 'binary',
          description: prop.description,
        }
      }
      // Handle array of files: z.array(z.instanceof(File))
      else if (prop.type === 'array' && this.isFileType(prop.items)) {
        result[key] = {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          description: prop.description,
        }
      }
      else {
        result[key] = prop
      }
    }

    return result
  }
}
```

**Example multipart endpoint documentation:**

```typescript
// Endpoint declaration
const uploadFile = API.declareMultipart({
  method: 'POST',
  url: '/files',
  requestSchema: z.object({
    file: z.instanceof(File),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }),
  responseSchema: z.object({
    fileId: z.string(),
    url: z.string(),
  }),
})

// Generated OpenAPI:
{
  "/files": {
    "post": {
      "requestBody": {
        "required": true,
        "content": {
          "multipart/form-data": {
            "schema": {
              "type": "object",
              "properties": {
                "file": { "type": "string", "format": "binary" },
                "description": { "type": "string" },
                "tags": { "type": "array", "items": { "type": "string" } }
              },
              "required": ["file"]
            }
          }
        }
      },
      "responses": {
        "200": {
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "properties": {
                  "fileId": { "type": "string" },
                  "url": { "type": "string" }
                }
              }
            }
          }
        }
      }
    }
  }
}
```

### 1.8 Stream Endpoint Handling

Stream endpoints (declared with `API.declareStream()`) have different response characteristics:

```typescript
class StreamPathGenerator {
  /**
   * Detect stream endpoints by checking the adapter token
   */
  isStream(handler: HandlerMetadata): boolean {
    return handler.adapterToken === StreamAdapterToken
  }

  /**
   * Generate responses for stream endpoints
   * Streams don't have a responseSchema, so we infer from common patterns
   */
  generateStreamResponses(
    config: BaseStreamConfig,
    metadata: StreamOpenApiMetadata
  ): ResponsesObject {
    // Default to binary stream if no content type specified
    const contentType = metadata.contentType ?? 'application/octet-stream'

    return {
      '200': {
        description: metadata.description ?? 'Stream response',
        content: this.getStreamContent(contentType),
      },
    }
  }

  private getStreamContent(contentType: string): ContentObject {
    switch (contentType) {
      case 'text/event-stream':
        return {
          'text/event-stream': {
            schema: {
              type: 'string',
              description: 'Server-Sent Events stream',
            },
          },
        }

      case 'application/octet-stream':
        return {
          'application/octet-stream': {
            schema: {
              type: 'string',
              format: 'binary',
              description: 'Binary file download',
            },
          },
        }

      case 'application/json':
        // For JSON streaming (NDJSON)
        return {
          'application/json': {
            schema: {
              type: 'string',
              description: 'Newline-delimited JSON stream',
            },
          },
        }

      default:
        return {
          [contentType]: {
            schema: { type: 'string', format: 'binary' },
          },
        }
    }
  }
}
```

**Stream-specific decorator for content type:**

```typescript
// New decorator for stream endpoints
@ApiStream({ contentType: 'text/event-stream', description: 'Real-time events' })
@ApiStream({ contentType: 'application/octet-stream', description: 'File download' })

// Implementation
function ApiStream(options: { contentType: string; description?: string }) {
  return AttributeFactory.createAttribute(ApiStreamToken,
    z.object({
      contentType: z.string(),
      description: z.string().optional(),
    })
  )(options)
}
```

**Example stream endpoint documentation:**

```typescript
// Endpoint declaration
const downloadFile = API.declareStream({
  method: 'GET',
  url: '/files/$fileId/download',
  querySchema: z.object({
    format: z.enum(['original', 'compressed']).optional(),
  }),
})

// Controller with stream metadata
@Controller()
export class FileController {
  @Stream(downloadFile)
  @ApiStream({
    contentType: 'application/octet-stream',
    description: 'Download file as binary stream'
  })
  @ApiOperation({ summary: 'Download a file' })
  async download(params: StreamParams<typeof downloadFile>, reply: Reply) {
    // Stream implementation
  }
}

// Generated OpenAPI:
{
  "/files/{fileId}/download": {
    "get": {
      "summary": "Download a file",
      "parameters": [
        { "name": "fileId", "in": "path", "required": true, "schema": { "type": "string" } },
        { "name": "format", "in": "query", "schema": { "type": "string", "enum": ["original", "compressed"] } }
      ],
      "responses": {
        "200": {
          "description": "Download file as binary stream",
          "content": {
            "application/octet-stream": {
              "schema": { "type": "string", "format": "binary" }
            }
          }
        }
      }
    }
  }
}
```

**SSE (Server-Sent Events) example:**

```typescript
const streamEvents = API.declareStream({
  method: 'GET',
  url: '/events',
})

@Controller()
export class EventController {
  @Stream(streamEvents)
  @ApiStream({
    contentType: 'text/event-stream',
    description: 'Real-time event stream'
  })
  @ApiTag('Events')
  async stream(params: StreamParams<typeof streamEvents>, reply: Reply) {
    // SSE implementation
  }
}

// Generated OpenAPI:
{
  "/events": {
    "get": {
      "tags": ["Events"],
      "responses": {
        "200": {
          "description": "Real-time event stream",
          "content": {
            "text/event-stream": {
              "schema": {
                "type": "string",
                "description": "Server-Sent Events stream"
              }
            }
          }
        }
      }
    }
  }
}
```

### 1.9 Endpoint Type Detection

The generator automatically detects endpoint type based on the adapter token stored in handler metadata:

```typescript
class EndpointTypeDetector {
  getEndpointType(handler: HandlerMetadata): 'endpoint' | 'multipart' | 'stream' {
    switch (handler.adapterToken) {
      case EndpointAdapterToken:
        return 'endpoint'
      case MultipartAdapterToken:
        return 'multipart'
      case StreamAdapterToken:
        return 'stream'
      default:
        return 'endpoint'
    }
  }

  generateRequestBody(
    config: BaseEndpointConfig,
    handler: HandlerMetadata
  ): RequestBodyObject | undefined {
    const type = this.getEndpointType(handler)

    switch (type) {
      case 'multipart':
        return this.multipartGenerator.generateMultipartRequestBody(config)
      case 'stream':
        return undefined // Streams typically don't have request bodies
      case 'endpoint':
      default:
        return this.generateJsonRequestBody(config)
    }
  }

  generateResponses(
    config: BaseEndpointConfig | BaseStreamConfig,
    handler: HandlerMetadata
  ): ResponsesObject {
    const type = this.getEndpointType(handler)

    switch (type) {
      case 'stream':
        return this.streamGenerator.generateStreamResponses(config, handler)
      case 'multipart':
      case 'endpoint':
      default:
        return this.generateJsonResponses(config, handler)
    }
  }
}
```

### 1.10 OpenAPI Document Generation Options

```typescript
interface OpenApiOptions {
  /**
   * OpenAPI document info
   */
  info: {
    title: string
    version: string
    description?: string
    termsOfService?: string
    contact?: {
      name?: string
      url?: string
      email?: string
    }
    license?: {
      name: string
      url?: string
    }
  }

  /**
   * External documentation
   */
  externalDocs?: {
    url: string
    description?: string
  }

  /**
   * Server definitions
   */
  servers?: Array<{
    url: string
    description?: string
    variables?: Record<string, {
      default: string
      enum?: string[]
      description?: string
    }>
  }>

  /**
   * Security scheme definitions
   */
  securitySchemes?: Record<string, SecuritySchemeObject>

  /**
   * Global security requirements
   */
  security?: SecurityRequirement[]

  /**
   * Tag definitions with descriptions
   */
  tags?: Array<{
    name: string
    description?: string
    externalDocs?: {
      url: string
      description?: string
    }
  }>

  /**
   * Path to serve OpenAPI JSON
   * @default '/openapi.json'
   */
  jsonPath?: string

  /**
   * Path to serve YAML version
   * @default '/openapi.yaml'
   */
  yamlPath?: string

  /**
   * Path to serve Scalar UI
   * @default '/docs'
   */
  docsPath?: string

  /**
   * Scalar UI configuration
   */
  scalar?: ScalarOptions
}
```

---

## Phase 2: Fastify Adapter Plugin (@navios/openapi-fastify)

### 2.1 Package Setup

```
packages/openapi-fastify/
├── src/
│   ├── index.mts
│   ├── openapi-fastify.plugin.mts
│   └── interfaces/
│       └── fastify-openapi-options.mts
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

### 2.2 Plugin Implementation

```typescript
import { FastifyPluginAsync } from 'fastify'
import ScalarApiReference from '@scalar/fastify-api-reference'

interface FastifyOpenApiPluginOptions extends OpenApiOptions {
  /**
   * Scalar theme configuration
   */
  scalar?: {
    theme?: 'default' | 'alternate' | 'moon' | 'purple' | 'solarized'
    favicon?: string
    logo?: string
    // ... other Scalar options
  }
}

export function defineOpenApiPlugin(options: FastifyOpenApiPluginOptions) {
  return {
    plugin: openApiFastifyPlugin,
    options,
  }
}

const openApiFastifyPlugin: FastifyPluginAsync<FastifyOpenApiPluginOptions> = async (
  fastify,
  options
) => {
  // Get OpenAPI generator service from DI container
  const generator = container.get(OpenApiGeneratorService)

  // Generate document
  const document = generator.generate(options)

  // Serve OpenAPI JSON
  fastify.get(options.jsonPath ?? '/openapi.json', async () => {
    return document
  })

  // Serve OpenAPI YAML
  fastify.get(options.yamlPath ?? '/openapi.yaml', async (request, reply) => {
    reply.type('text/yaml')
    return yaml.stringify(document)
  })

  // Register Scalar UI
  await fastify.register(ScalarApiReference, {
    routePrefix: options.docsPath ?? '/docs',
    configuration: {
      theme: options.scalar?.theme ?? 'default',
      spec: {
        url: options.jsonPath ?? '/openapi.json',
      },
      ...options.scalar,
    },
  })
}
```

### 2.3 Integration with NaviosApplication

```typescript
// Usage in application setup
import { NaviosFactory } from '@navios/core'
import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { defineOpenApiPlugin } from '@navios/openapi-fastify'

const app = await NaviosFactory.create(AppModule, {
  adapter: defineFastifyEnvironment(),
})

// Enable OpenAPI documentation
app.usePlugin(defineOpenApiPlugin({
  info: {
    title: 'My API',
    version: '1.0.0',
    description: 'API documentation',
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
  },
  scalar: {
    theme: 'purple',
  },
}))

await app.listen({ port: 3000 })
```

---

## Phase 3: Enhanced Schema Support

### 3.1 Zod Meta Extensions for OpenAPI

Support Zod 4's `.meta()` for OpenAPI-specific metadata:

```typescript
// schemas/user.schema.ts
export const userSchema = z.object({
  id: z.string()
    .meta({
      openapi: {
        description: 'Unique user identifier',
        example: 'usr_123abc',
      }
    }),

  name: z.string()
    .min(1)
    .max(100)
    .meta({
      openapi: {
        description: 'User display name',
        example: 'John Doe',
      }
    }),

  email: z.string()
    .email()
    .meta({
      openapi: {
        description: 'User email address',
        example: 'john@example.com',
        format: 'email',
      }
    }),

  role: z.enum(['user', 'admin', 'moderator'])
    .meta({
      openapi: {
        description: 'User role in the system',
        example: 'user',
      }
    }),

  createdAt: z.date()
    .meta({
      openapi: {
        description: 'Account creation timestamp',
        example: '2024-01-15T10:30:00Z',
      }
    }),
}).meta({
  openapi: {
    title: 'User',
    description: 'Represents a user in the system',
  }
})
```

### 3.2 Response Schema Support

Handle different response status codes:

```typescript
// Using discriminated unions for different responses
const getUserResponse = z.discriminatedUnion('status', [
  z.object({
    status: z.literal('success'),
    data: userSchema,
  }).meta({
    openapi: { statusCode: 200 }
  }),
  z.object({
    status: z.literal('error'),
    message: z.string(),
  }).meta({
    openapi: { statusCode: 404 }
  }),
])
```

---

## Phase 4: Documentation & Examples

### 4.1 Create Package Documentation

Add `specs/navios-openapi.md` with complete API documentation.

### 4.2 Add Documentation to Docs Site

Update `apps/docs/docs/server/` with OpenAPI documentation guide.

### 4.3 Example Application

Create example in `apps/examples/` demonstrating:
- Basic OpenAPI setup
- Using decorators for documentation
- Schema metadata
- Scalar UI customization

---

## Implementation Order

### Step 0: Core Infrastructure (@navios/core)
- [ ] Create `src/interfaces/plugin.interface.mts` with `NaviosPlugin`, `PluginContext`, `PluginDefinition`
- [ ] Update `src/interfaces/index.mts` to export plugin interfaces
- [ ] Add `getGlobalPrefix()` to `AbstractHttpAdapterInterface`
- [ ] Update `NaviosApplication` with `usePlugin()` method and plugin storage
- [ ] Add `initPlugins()` private method to `NaviosApplication.init()`
- [ ] Update `src/index.mts` to export plugin types
- [ ] Update Fastify adapter to implement `getGlobalPrefix()`
- [ ] Update Bun adapter to implement `getGlobalPrefix()`
- [ ] Add tests for plugin system
- [ ] Update @navios/core specification document

### Step 1: Core Package Foundation (@navios/openapi)
- [ ] Create package structure for `@navios/openapi`
- [ ] Implement metadata storage using AttributeFactory
- [ ] Implement basic decorators (@ApiTag, @ApiOperation, @ApiSummary, @ApiDeprecated, @ApiExclude)
- [ ] Add tests for decorators

### Step 2: Schema & Document Generation
- [ ] Integrate `zod-openapi` for schema conversion
- [ ] Implement EndpointScanner
- [ ] Implement PathGenerator
- [ ] Implement ParameterGenerator
- [ ] Implement OpenApiGeneratorService
- [ ] Add tests for generators

### Step 3: Fastify Integration (@navios/openapi-fastify)
- [ ] Create package structure for `@navios/openapi-fastify`
- [ ] Implement Fastify plugin with Scalar integration
- [ ] Add route registration for /openapi.json, /openapi.yaml, /docs
- [ ] Add tests for Fastify plugin

### Step 4: Enhanced Features
- [ ] Implement @ApiSecurity decorator
- [ ] Add support for response status codes from @HttpCode
- [ ] Handle multipart and stream endpoints
- [ ] Add support for discriminated union responses

### Step 5: Documentation & Polish
- [ ] Write @navios/openapi specification document
- [ ] Write @navios/openapi-fastify specification document
- [ ] Add documentation to docs site
- [ ] Create example application
- [ ] Add README files

---

## API Summary

### Decorators (from @navios/openapi)

| Decorator | Target | Description |
|-----------|--------|-------------|
| `@ApiTag(name, description?)` | Class/Method | Groups endpoints under a tag |
| `@ApiOperation(options)` | Method | Full operation metadata |
| `@ApiSummary(summary)` | Method | Short summary |
| `@ApiDeprecated(message?)` | Method | Mark as deprecated |
| `@ApiSecurity(requirements)` | Class/Method | Security requirements |
| `@ApiExclude()` | Method | Exclude from docs |
| `@ApiStream(options)` | Method | Stream content-type and description |

### Main Exports (from @navios/openapi)

```typescript
// Decorators
export { ApiTag, ApiOperation, ApiSummary, ApiDeprecated, ApiSecurity, ApiExclude, ApiStream }

// Types
export type { OpenApiOptions, ApiOperationOptions, ApiStreamOptions }

// Services (for advanced use)
export { OpenApiGeneratorService, EndpointScanner }
```

### Fastify Plugin (from @navios/openapi-fastify)

```typescript
export { defineOpenApiPlugin }
export type { FastifyOpenApiPluginOptions }
```

---

## Example Usage

```typescript
// shared/endpoints/users.ts
import { builder } from '@navios/builder'
import { z } from 'zod'

const API = builder()

export const userSchema = z.object({
  id: z.string().meta({ openapi: { example: 'usr_123' } }),
  name: z.string().meta({ openapi: { example: 'John Doe' } }),
  email: z.string().email(),
})

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
```

```typescript
// server/controllers/user.controller.ts
import { Controller, Endpoint, EndpointParams, HttpCode } from '@navios/core'
import { ApiTag, ApiOperation, ApiSummary, ApiSecurity } from '@navios/openapi'
import { getUser, createUser } from '../shared/endpoints/users'

@Controller()
@ApiTag('Users', 'User management operations')
export class UserController {
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
```

```typescript
// server/main.ts
import { NaviosFactory, Module } from '@navios/core'
import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { defineOpenApiPlugin } from '@navios/openapi-fastify'
import { UserController } from './controllers/user.controller'

@Module({ controllers: [UserController] })
class AppModule {}

async function bootstrap() {
  const app = await NaviosFactory.create(AppModule, {
    adapter: defineFastifyEnvironment(),
  })

  app.usePlugin(defineOpenApiPlugin({
    info: {
      title: 'My API',
      version: '1.0.0',
    },
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
      },
    },
  }))

  await app.listen({ port: 3000 })
  console.log('API docs available at http://localhost:3000/docs')
}

bootstrap()
```

---

## Dependencies

### @navios/openapi
```json
{
  "dependencies": {
    "zod-openapi": "^4.0.0",
    "yaml": "^2.0.0"
  },
  "peerDependencies": {
    "@navios/core": "^0.6.0",
    "@navios/di": "^0.6.0",
    "zod": "^4.0.0"
  }
}
```

### @navios/openapi-fastify
```json
{
  "dependencies": {
    "@scalar/fastify-api-reference": "^1.0.0"
  },
  "peerDependencies": {
    "@navios/openapi": "^0.1.0",
    "@navios/adapter-fastify": "^0.6.0",
    "fastify": "^4.0.0 || ^5.0.0"
  }
}
```

---

## References

- [Scalar Documentation](https://scalar.com/)
- [Scalar GitHub](https://github.com/scalar/scalar)
- [Scalar Fastify Integration](https://guides.scalar.com/scalar/scalar-api-references/integrations/fastify)
- [zod-openapi](https://github.com/samchungy/zod-openapi)
- [OpenAPI 3.1 Specification](https://spec.openapis.org/oas/v3.1.0)
