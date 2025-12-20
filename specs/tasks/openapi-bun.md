# @navios/openapi-bun Implementation Plan

## Overview

Create `@navios/openapi-bun` that provides OpenAPI documentation endpoints for Bun-based Navios applications. Unlike the Fastify implementation which registers routes directly on the Fastify instance, this implementation will use the standard Navios controller pattern by dynamically injecting controllers through a new `ModuleLoaderService.extendModules()` capability.

**Package:** `@navios/openapi-bun`
**Dependencies:** `@navios/core`, `@navios/openapi`, `@navios/adapter-bun`
**UI Integration:** Scalar (via `@scalar/core` HTML rendering)

---

## Architecture Goals

### Why Different From Fastify?

The Fastify OpenAPI plugin registers routes directly on the Fastify instance:
```typescript
// Current Fastify approach
fastify.get('/openapi.json', handler)
fastify.get('/docs', handler)
```

This works but bypasses the Navios controller system. For Bun (and as a better pattern overall), we want:

1. **Use standard controllers** - OpenAPI endpoints are regular Navios controllers
2. **Plugin-injected modules** - Controllers are dynamically added during plugin registration
3. **Modular endpoints** - Separate controllers for JSON, YAML, and UI (user chooses which to include)
4. **DI-based configuration** - Options provided via injection token, not closure capture

### Benefits

- OpenAPI endpoints appear in the module tree (can be discovered by other plugins)
- Standard request lifecycle (guards, middleware apply)
- Consistent with Navios patterns
- More testable (controllers are normal injectable classes)
- Selective inclusion (only register what you need)

---

## Phase 0: Core Infrastructure Changes

### 0.1 Add `extendModules()` to ModuleLoaderService

The key change is adding ability to extend the module tree after initial loading but before route registration.

**File:** `packages/core/src/services/module-loader.service.mts`

```typescript
import type { ClassTypeWithInstance } from '@navios/di'
import type { ClassType } from '@navios/di'

import { Container, inject, Injectable } from '@navios/di'

import type { NaviosModule } from '../interfaces/index.mjs'
import type { ModuleMetadata } from '../metadata/index.mjs'

import { Logger } from '../logger/index.mjs'
import { extractModuleMetadata, extractControllerMetadata } from '../metadata/index.mjs'

/**
 * Extension definition for dynamically adding to the module tree.
 * Used by plugins to inject controllers or entire modules.
 */
export interface ModuleExtension {
  /**
   * Module class to add. If provided, the module and all its
   * controllers/imports will be processed.
   */
  module?: ClassTypeWithInstance<NaviosModule>

  /**
   * Controllers to add directly without a wrapper module.
   * Will be registered under a synthetic module named after the plugin.
   */
  controllers?: ClassType[]

  /**
   * Name for the synthetic module when using controllers directly.
   * Required if `controllers` is provided without `module`.
   */
  moduleName?: string
}

@Injectable()
export class ModuleLoaderService {
  private logger = inject(Logger, {
    context: ModuleLoaderService.name,
  })
  protected container = inject(Container)
  private modulesMetadata: Map<string, ModuleMetadata> = new Map()
  private loadedModules: Map<string, any> = new Map()
  private initialized = false

  async loadModules(appModule: ClassTypeWithInstance<NaviosModule>) {
    if (this.initialized) {
      return
    }
    await this.traverseModules(appModule)
    this.initialized = true
  }

  /**
   * Extends the module tree with additional modules or controllers.
   *
   * This method is designed to be called by plugins during registration,
   * which happens after initial module loading but before route registration.
   *
   * @param extensions - Array of module extensions to add
   * @throws Error if not initialized (loadModules must be called first)
   *
   * @example
   * ```typescript
   * // In plugin registration
   * const moduleLoader = await context.container.get(ModuleLoaderService)
   * await moduleLoader.extendModules([{
   *   controllers: [OpenApiJsonController, OpenApiYamlController],
   *   moduleName: 'OpenApiBunModule',
   * }])
   * ```
   */
  async extendModules(extensions: ModuleExtension[]): Promise<void> {
    if (!this.initialized) {
      throw new Error(
        'ModuleLoaderService must be initialized before extending. Call loadModules() first.'
      )
    }

    for (const extension of extensions) {
      if (extension.module) {
        // Process a full module with its imports and controllers
        await this.traverseModules(extension.module)
      } else if (extension.controllers && extension.moduleName) {
        // Create synthetic module metadata for loose controllers
        await this.registerControllers(
          extension.controllers,
          extension.moduleName
        )
      } else if (extension.controllers) {
        throw new Error(
          'moduleName is required when providing controllers without a module'
        )
      }
    }
  }

  /**
   * Registers controllers under a synthetic module.
   * Used when plugins want to add controllers without a full module class.
   */
  private async registerControllers(
    controllers: ClassType[],
    moduleName: string
  ): Promise<void> {
    if (this.modulesMetadata.has(moduleName)) {
      // Merge controllers into existing module
      const existing = this.modulesMetadata.get(moduleName)!
      for (const controller of controllers) {
        existing.controllers.add(controller)
        // Ensure controller is registered in DI container
        await this.container.get(controller)
      }
      this.logger.debug(`Extended module ${moduleName} with ${controllers.length} controllers`)
    } else {
      // Create new synthetic module metadata
      const metadata: ModuleMetadata = {
        controllers: new Set(controllers),
        imports: new Set(),
        guards: new Set(),
        customAttributes: new Map(),
      }
      this.modulesMetadata.set(moduleName, metadata)

      // Register controllers in DI container
      for (const controller of controllers) {
        await this.container.get(controller)
      }

      this.logger.debug(`Created module ${moduleName} with ${controllers.length} controllers`)
    }
  }

  private async traverseModules(
    module: ClassTypeWithInstance<NaviosModule>,
    parentMetadata?: ModuleMetadata,
  ) {
    const metadata = extractModuleMetadata(module)
    if (parentMetadata) {
      this.mergeMetadata(metadata, parentMetadata)
    }
    const moduleName = module.name
    if (this.modulesMetadata.has(moduleName)) {
      return
    }
    try {
      this.modulesMetadata.set(moduleName, metadata)
      const imports = metadata.imports ?? new Set()
      const loadingPromises = Array.from(imports).map(async (importedModule) =>
        this.traverseModules(importedModule, metadata),
      )
      await Promise.all(loadingPromises)
      const instance = await this.container.get(module)
      if (instance.onModuleInit) {
        await instance.onModuleInit()
      }
      this.logger.debug(`Module ${moduleName} loaded`)
      this.loadedModules.set(moduleName, instance)
    } catch (error) {
      this.logger.error(`Error loading module ${moduleName}`, error)
      throw error
    }
  }

  private mergeMetadata(
    metadata: ModuleMetadata,
    parentMetadata: ModuleMetadata,
  ): void {
    if (parentMetadata.guards) {
      for (const guard of parentMetadata.guards) {
        metadata.guards.add(guard)
      }
    }
    if (parentMetadata.customAttributes) {
      for (const [key, value] of parentMetadata.customAttributes) {
        if (metadata.customAttributes.has(key)) {
          continue
        }
        metadata.customAttributes.set(key, value)
      }
    }
  }

  getAllModules(): Map<string, ModuleMetadata> {
    return this.modulesMetadata
  }

  dispose() {
    this.modulesMetadata.clear()
    this.loadedModules.clear()
    this.initialized = false
  }
}
```

### 0.2 Update PluginContext

Add `ModuleLoaderService` to the plugin context for convenience:

**File:** `packages/core/src/interfaces/plugin.interface.mts`

```typescript
import type { Container } from '@navios/di'
import type { ModuleMetadata } from '../metadata/index.mjs'
import type { ModuleLoaderService } from '../services/index.mjs'

export interface PluginContext {
  modules: Map<string, ModuleMetadata>
  server: any
  container: Container
  globalPrefix: string

  /**
   * Module loader service for extending the module tree.
   * Use `moduleLoader.extendModules()` to add controllers dynamically.
   */
  moduleLoader: ModuleLoaderService
}
```

**File:** `packages/core/src/navios.application.mts` (update initPlugins)

```typescript
private async initPlugins() {
  if (this.plugins.length === 0) return

  const context: PluginContext = {
    modules: this.moduleLoader.getAllModules(),
    server: this.httpApplication?.getServer() ?? null,
    container: this.container,
    globalPrefix: this.httpApplication?.getGlobalPrefix() ?? '',
    moduleLoader: this.moduleLoader,  // Add this
  }

  for (const { plugin, options } of this.plugins) {
    this.logger.debug(`Initializing plugin: ${plugin.name}`)
    await plugin.register(context, options)
  }
}
```

### 0.3 Core Changes Summary

| File | Change |
|------|--------|
| `packages/core/src/services/module-loader.service.mts` | Add `extendModules()` method and `ModuleExtension` interface |
| `packages/core/src/interfaces/plugin.interface.mts` | Add `moduleLoader` to `PluginContext` |
| `packages/core/src/navios.application.mts` | Pass `moduleLoader` in plugin context |
| `packages/core/src/index.mts` | Export `ModuleExtension` type |

---

## Phase 1: Package Structure

### 1.1 Create Package

```
packages/openapi-bun/
├── src/
│   ├── index.mts                           # Public exports
│   ├── openapi-bun.plugin.mts              # Main plugin
│   ├── tokens/
│   │   ├── index.mts
│   │   └── openapi-options.token.mts       # Options injection token
│   ├── services/
│   │   ├── index.mts
│   │   └── openapi-document.service.mts    # Document generation/caching
│   ├── controllers/
│   │   ├── index.mts
│   │   ├── openapi-json.controller.mts     # /openapi.json endpoint
│   │   ├── openapi-yaml.controller.mts     # /openapi.yaml endpoint
│   │   └── openapi-ui.controller.mts       # /docs endpoint (Scalar UI)
│   └── schemas/
│       ├── index.mts
│       └── options.schema.mts              # Zod schemas for options
├── package.json
├── tsconfig.json
├── tsdown.config.mts
└── vitest.config.mts
```

### 1.2 Package.json

```json
{
  "name": "@navios/openapi-bun",
  "version": "0.1.0",
  "description": "OpenAPI documentation plugin for Navios with Bun adapter",
  "type": "module",
  "exports": {
    ".": {
      "import": "./dist/src/index.mjs",
      "types": "./dist/src/index.d.mts"
    }
  },
  "files": ["dist", "lib"],
  "dependencies": {
    "@scalar/core": "^0.1.0",
    "yaml": "^2.0.0"
  },
  "peerDependencies": {
    "@navios/core": "^0.7.0",
    "@navios/di": "^0.7.0",
    "@navios/openapi": "^0.1.0",
    "@navios/adapter-bun": "^0.7.0",
    "@navios/builder": "^0.7.0"
  },
  "devDependencies": {
    "zod": "^3.24.0"
  }
}
```

---

## Phase 2: Options Token & Service

### 2.1 Options Injection Token

The options token allows controllers to access plugin configuration via dependency injection.

**File:** `src/tokens/openapi-options.token.mts`

```typescript
import { InjectionToken } from '@navios/core'
import type { BunOpenApiPluginOptions } from '../schemas/options.schema.mjs'

/**
 * Injection token for OpenAPI plugin options.
 *
 * Controllers inject this to access the plugin configuration
 * (paths, Scalar theme, info, etc.)
 *
 * @example
 * ```typescript
 * @Injectable()
 * class OpenApiJsonController {
 *   private options = inject(OpenApiOptionsToken)
 * }
 * ```
 */
export const OpenApiOptionsToken = InjectionToken.create<BunOpenApiPluginOptions>(
  Symbol.for('BunOpenApiPluginOptions')
)
```

### 2.2 Options Schema

**File:** `src/schemas/options.schema.mts`

```typescript
import { z } from 'zod'
import type { OpenApiGeneratorOptions } from '@navios/openapi'

/**
 * Scalar UI theme options
 */
export const scalarThemeSchema = z.enum([
  'default',
  'alternate',
  'moon',
  'purple',
  'solarized',
  'bluePlanet',
  'saturn',
  'kepler',
  'mars',
  'deepSpace',
  'none',
])

export type ScalarTheme = z.infer<typeof scalarThemeSchema>

/**
 * Scalar UI configuration options
 */
export const scalarOptionsSchema = z.object({
  theme: scalarThemeSchema.optional(),
  favicon: z.string().optional(),
  customCss: z.string().optional(),
  hideDownloadButton: z.boolean().optional(),
  hideSearch: z.boolean().optional(),
  metaData: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
  }).optional(),
  cdn: z.string().optional(),
})

export type ScalarOptions = z.infer<typeof scalarOptionsSchema>

/**
 * Base options for the Bun OpenAPI plugin
 */
export const bunOpenApiPluginOptionsBaseSchema = z.object({
  /**
   * Path to serve OpenAPI JSON
   * @default '/openapi.json'
   */
  jsonPath: z.string().default('/openapi.json'),

  /**
   * Path to serve OpenAPI YAML
   * @default '/openapi.yaml'
   */
  yamlPath: z.string().default('/openapi.yaml'),

  /**
   * Path to serve Scalar UI
   * @default '/docs'
   */
  docsPath: z.string().default('/docs'),

  /**
   * Disable JSON endpoint
   * @default false
   */
  disableJson: z.boolean().default(false),

  /**
   * Disable YAML endpoint
   * @default true
   */
  disableYaml: z.boolean().default(true),

  /**
   * Disable Scalar UI endpoint
   * @default false
   */
  disableScalar: z.boolean().default(false),

  /**
   * Scalar UI configuration
   */
  scalar: scalarOptionsSchema.optional(),
})

export type BunOpenApiPluginOptionsBase = z.infer<typeof bunOpenApiPluginOptionsBaseSchema>

/**
 * Combined options for the Bun OpenAPI plugin.
 * Extends OpenApiGeneratorOptions with Bun-specific settings.
 */
export interface BunOpenApiPluginOptions
  extends OpenApiGeneratorOptions,
          Partial<BunOpenApiPluginOptionsBase> {}
```

### 2.3 Document Service

Caches the generated OpenAPI document and provides it to controllers.

**File:** `src/services/openapi-document.service.mts`

```typescript
import type { OpenAPIObject } from '@navios/openapi'
import type { ModuleMetadata } from '@navios/core'

import { inject, Injectable, InjectionToken } from '@navios/core'
import { OpenApiGeneratorService } from '@navios/openapi'
import { stringify as yamlStringify } from 'yaml'

import { OpenApiOptionsToken } from '../tokens/openapi-options.token.mjs'

/**
 * Injection token for the document service
 */
export const OpenApiDocumentServiceToken = InjectionToken.create<OpenApiDocumentService>(
  Symbol.for('OpenApiDocumentService')
)

/**
 * Service that generates and caches the OpenAPI document.
 *
 * The document is generated once during plugin initialization
 * and served by controllers.
 */
@Injectable({
  token: OpenApiDocumentServiceToken,
})
export class OpenApiDocumentService {
  private options = inject(OpenApiOptionsToken)
  private generator = inject(OpenApiGeneratorService)

  private document: OpenAPIObject | null = null
  private yamlDocument: string | null = null
  private modules: Map<string, ModuleMetadata> | null = null

  /**
   * Initializes the document service with module metadata.
   * Called by the plugin during registration.
   */
  initialize(modules: Map<string, ModuleMetadata>, globalPrefix: string): void {
    this.modules = modules

    // Generate document
    this.document = this.generator.generate(modules, this.options)

    // Apply global prefix to servers if not already set
    if (globalPrefix && this.document.servers?.length === 0) {
      this.document.servers = [{ url: globalPrefix }]
    }

    // Pre-generate YAML
    this.yamlDocument = yamlStringify(this.document)
  }

  /**
   * Returns the OpenAPI document as JSON-serializable object.
   */
  getDocument(): OpenAPIObject {
    if (!this.document) {
      throw new Error('OpenApiDocumentService not initialized. Call initialize() first.')
    }
    return this.document
  }

  /**
   * Returns the OpenAPI document as YAML string.
   */
  getYamlDocument(): string {
    if (!this.yamlDocument) {
      throw new Error('OpenApiDocumentService not initialized. Call initialize() first.')
    }
    return this.yamlDocument
  }
}
```

---

## Phase 3: Controllers

### 3.1 JSON Controller

**File:** `src/controllers/openapi-json.controller.mts`

```typescript
import { builder } from '@navios/builder'
import { Controller, Endpoint, inject } from '@navios/core'
import { ApiExclude } from '@navios/openapi'
import { z } from 'zod'

import { OpenApiDocumentServiceToken } from '../services/openapi-document.service.mjs'

const API = builder()

/**
 * Schema for OpenAPI document response.
 * Uses z.record(z.unknown()) since OpenAPI documents have complex structure.
 */
const openApiDocumentSchema = z.record(z.string(), z.unknown())

/**
 * Creates a customized JSON controller with the correct path.
 * Called by the plugin to create a controller with the configured jsonPath.
 */
export function createOpenApiJsonController(jsonPath: string) {
  const API = builder()

  const endpoint = API.declareEndpoint({
    method: 'GET',
    url: jsonPath,
    responseSchema: openApiDocumentSchema,
  })

  @Controller()
  @ApiExclude()
  class OpenApiJsonController {
    private documentService = inject(OpenApiDocumentServiceToken)

    @Endpoint(endpoint)
    async getJson() {
      return this.documentService.getDocument()
    }
  }

  return OpenApiJsonController
}
```

### 3.2 YAML Controller

**File:** `src/controllers/openapi-yaml.controller.mts`

```typescript
import { builder } from '@navios/builder'
import { Controller, inject, Stream } from '@navios/core'
import { ApiExclude, ApiStream } from '@navios/openapi'

import { OpenApiDocumentServiceToken } from '../services/openapi-document.service.mjs'

/**
 * Creates a customized YAML controller with the correct path.
 * Uses Stream endpoint to set content-type header properly.
 */
export function createOpenApiYamlController(yamlPath: string) {
  const API = builder()

  const endpoint = API.declareStream({
    method: 'GET',
    url: yamlPath,
  })

  @Controller()
  @ApiExclude()
  class OpenApiYamlController {
    private documentService = inject(OpenApiDocumentServiceToken)

    @Stream(endpoint)
    @ApiStream({ contentType: 'text/yaml' })
    async getYaml() {
      const yaml = this.documentService.getYamlDocument()

      // Return a Response with proper content-type
      return new Response(yaml, {
        headers: {
          'Content-Type': 'text/yaml; charset=utf-8',
        },
      })
    }
  }

  return OpenApiYamlController
}
```

### 3.3 UI Controller (Scalar)

**File:** `src/controllers/openapi-ui.controller.mts`

```typescript
import { builder } from '@navios/builder'
import { Controller, inject, Stream } from '@navios/core'
import { ApiExclude, ApiStream } from '@navios/openapi'
import { getHtmlDocument } from '@scalar/core/libs/html-rendering'

import { OpenApiOptionsToken } from '../tokens/openapi-options.token.mjs'
import type { ScalarOptions } from '../schemas/options.schema.mjs'

/**
 * Creates a customized Scalar UI controller with the correct path.
 */
export function createOpenApiUiController(docsPath: string, jsonPath: string) {
  const API = builder()

  const endpoint = API.declareStream({
    method: 'GET',
    url: docsPath,
  })

  @Controller()
  @ApiExclude()
  class OpenApiUiController {
    private options = inject(OpenApiOptionsToken)
    private html: string | null = null

    @Stream(endpoint)
    @ApiStream({ contentType: 'text/html' })
    async getUi() {
      // Generate HTML on first request (lazy initialization)
      if (!this.html) {
        this.html = this.generateHtml()
      }

      return new Response(this.html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
        },
      })
    }

    private generateHtml(): string {
      const scalarOptions: ScalarOptions = this.options.scalar ?? {}

      return getHtmlDocument({
        url: jsonPath,
        theme: scalarOptions.theme ?? 'default',
        favicon: scalarOptions.favicon,
        customCss: scalarOptions.customCss,
        hideDownloadButton: scalarOptions.hideDownloadButton,
        hideSearch: scalarOptions.hideSearch,
        metaData: scalarOptions.metaData,
        cdn: scalarOptions.cdn,
        pageTitle: scalarOptions.metaData?.title ?? 'API Reference',
      })
    }
  }

  return OpenApiUiController
}
```

---

## Phase 4: Plugin Implementation

### 4.1 Main Plugin

**File:** `src/openapi-bun.plugin.mts`

```typescript
import type {
  NaviosPlugin,
  PluginContext,
  PluginDefinition,
} from '@navios/core'
import type { ClassType } from '@navios/di'

import { InjectableScope, InjectableType } from '@navios/di'
import { OpenApiGeneratorService } from '@navios/openapi'

import type { BunOpenApiPluginOptions, ScalarOptions, ScalarTheme } from './schemas/options.schema.mjs'

import { bunOpenApiPluginOptionsBaseSchema } from './schemas/options.schema.mjs'
import { OpenApiOptionsToken } from './tokens/openapi-options.token.mjs'
import { OpenApiDocumentService, OpenApiDocumentServiceToken } from './services/openapi-document.service.mjs'
import { createOpenApiJsonController } from './controllers/openapi-json.controller.mjs'
import { createOpenApiYamlController } from './controllers/openapi-yaml.controller.mjs'
import { createOpenApiUiController } from './controllers/openapi-ui.controller.mjs'

/**
 * OpenAPI plugin for Bun adapter.
 *
 * This plugin:
 * - Scans all registered modules for endpoints
 * - Generates an OpenAPI 3.1 document
 * - Injects controllers for JSON, YAML, and Scalar UI endpoints
 *
 * Unlike the Fastify plugin which registers routes directly,
 * this plugin uses the standard Navios controller pattern via
 * ModuleLoaderService.extendModules().
 */
export class OpenApiBunPlugin implements NaviosPlugin<BunOpenApiPluginOptions> {
  readonly name = 'openapi-bun'

  async register(
    context: PluginContext,
    options: BunOpenApiPluginOptions,
  ): Promise<void> {
    // Parse and validate options with defaults
    const parsedOptions = bunOpenApiPluginOptionsBaseSchema.parse(options)
    const fullOptions = { ...options, ...parsedOptions }

    // Step 1: Register options in DI container
    this.registerOptions(context, fullOptions)

    // Step 2: Register document service and initialize it
    await this.initializeDocumentService(context, fullOptions)

    // Step 3: Create and register controllers based on options
    const controllers = this.createControllers(parsedOptions)

    // Step 4: Extend modules with our controllers
    if (controllers.length > 0) {
      await context.moduleLoader.extendModules([{
        controllers,
        moduleName: 'OpenApiBunModule',
      }])
    }
  }

  /**
   * Registers the plugin options in the DI container.
   */
  private registerOptions(
    context: PluginContext,
    options: BunOpenApiPluginOptions,
  ): void {
    const locator = context.container.getServiceLocator()
    const instanceName = locator.getInstanceIdentifier(OpenApiOptionsToken)

    locator.getManager().storeCreatedHolder(
      instanceName,
      options,
      InjectableType.Value,
      InjectableScope.Singleton,
    )
  }

  /**
   * Registers and initializes the document service.
   */
  private async initializeDocumentService(
    context: PluginContext,
    options: BunOpenApiPluginOptions,
  ): Promise<void> {
    // Ensure OpenApiGeneratorService is available
    // (it should be registered by @navios/openapi)

    // Register our document service
    const locator = context.container.getServiceLocator()

    // Get the document service from container (triggers DI registration)
    const documentService = await context.container.get(OpenApiDocumentService)

    // Initialize with modules and options
    documentService.initialize(context.modules, context.globalPrefix)
  }

  /**
   * Creates controller classes based on options.
   */
  private createControllers(
    options: ReturnType<typeof bunOpenApiPluginOptionsBaseSchema.parse>,
  ): ClassType[] {
    const controllers: ClassType[] = []

    if (!options.disableJson) {
      controllers.push(createOpenApiJsonController(options.jsonPath))
    }

    if (!options.disableYaml) {
      controllers.push(createOpenApiYamlController(options.yamlPath))
    }

    if (!options.disableScalar) {
      controllers.push(
        createOpenApiUiController(options.docsPath, options.jsonPath)
      )
    }

    return controllers
  }
}

/**
 * Creates a plugin definition for the OpenAPI Bun plugin.
 *
 * @param options - Plugin configuration options
 * @returns Plugin definition to pass to `app.usePlugin()`
 *
 * @example
 * ```typescript
 * import { NaviosFactory } from '@navios/core'
 * import { defineBunEnvironment } from '@navios/adapter-bun'
 * import { defineOpenApiPlugin } from '@navios/openapi-bun'
 *
 * const app = await NaviosFactory.create(AppModule, {
 *   adapter: defineBunEnvironment(),
 * })
 *
 * app.usePlugin(defineOpenApiPlugin({
 *   info: {
 *     title: 'My API',
 *     version: '1.0.0',
 *     description: 'API documentation',
 *   },
 *   servers: [
 *     { url: 'http://localhost:3000', description: 'Development' },
 *   ],
 *   scalar: {
 *     theme: 'purple',
 *   },
 * }))
 *
 * await app.listen({ port: 3000 })
 * // API docs available at http://localhost:3000/docs
 * ```
 */
export function defineOpenApiPlugin(
  options: BunOpenApiPluginOptions,
): PluginDefinition<BunOpenApiPluginOptions> {
  return {
    plugin: new OpenApiBunPlugin(),
    options,
  }
}

// Re-export types for convenience
export type { ScalarOptions, ScalarTheme, BunOpenApiPluginOptions }
```

### 4.2 Public Exports

**File:** `src/index.mts`

```typescript
// Plugin
export { OpenApiBunPlugin, defineOpenApiPlugin } from './openapi-bun.plugin.mjs'

// Types
export type {
  BunOpenApiPluginOptions,
  BunOpenApiPluginOptionsBase,
  ScalarOptions,
  ScalarTheme,
} from './schemas/options.schema.mjs'

// Tokens (for advanced use cases)
export { OpenApiOptionsToken } from './tokens/openapi-options.token.mjs'
export { OpenApiDocumentServiceToken } from './services/openapi-document.service.mjs'

// Services (for advanced use cases)
export { OpenApiDocumentService } from './services/openapi-document.service.mjs'

// Controller factories (for custom setups)
export { createOpenApiJsonController } from './controllers/openapi-json.controller.mjs'
export { createOpenApiYamlController } from './controllers/openapi-yaml.controller.mjs'
export { createOpenApiUiController } from './controllers/openapi-ui.controller.mjs'
```

---

## Phase 5: Example Usage

### 5.1 Basic Example

```typescript
// main.ts
import { NaviosFactory, Module, Controller, Endpoint } from '@navios/core'
import { defineBunEnvironment } from '@navios/adapter-bun'
import { defineOpenApiPlugin } from '@navios/openapi-bun'
import { ApiTag, ApiOperation } from '@navios/openapi'
import { builder } from '@navios/builder'
import { z } from 'zod'

const API = builder()

const getUsers = API.declareEndpoint({
  method: 'GET',
  url: '/users',
  responseSchema: z.array(z.object({
    id: z.string(),
    name: z.string(),
  })),
})

@Controller()
@ApiTag('Users')
class UserController {
  @Endpoint(getUsers)
  @ApiOperation({ summary: 'List all users' })
  async getUsers() {
    return [
      { id: '1', name: 'Alice' },
      { id: '2', name: 'Bob' },
    ]
  }
}

@Module({ controllers: [UserController] })
class AppModule {}

async function bootstrap() {
  const app = await NaviosFactory.create(AppModule, {
    adapter: defineBunEnvironment(),
  })

  app.usePlugin(defineOpenApiPlugin({
    info: {
      title: 'My Bun API',
      version: '1.0.0',
    },
    scalar: {
      theme: 'purple',
    },
  }))

  await app.init()
  await app.listen({ port: 3000 })

  console.log('API docs: http://localhost:3000/docs')
}

bootstrap()
```

### 5.2 Advanced Example with Stream

```typescript
// SSE endpoint with OpenAPI documentation
import { Controller, Stream, StreamParams } from '@navios/core'
import { ApiTag, ApiStream, ApiOperation } from '@navios/openapi'
import { builder } from '@navios/builder'

const API = builder()

const streamEvents = API.declareStream({
  method: 'GET',
  url: '/events',
})

@Controller()
@ApiTag('Events')
class EventController {
  @Stream(streamEvents)
  @ApiStream({
    contentType: 'text/event-stream',
    description: 'Real-time event stream'
  })
  @ApiOperation({ summary: 'Subscribe to real-time events' })
  async stream(params: StreamParams<typeof streamEvents>) {
    const stream = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder()
        let id = 0

        const interval = setInterval(() => {
          const event = `data: ${JSON.stringify({ id: ++id, time: Date.now() })}\n\n`
          controller.enqueue(encoder.encode(event))
        }, 1000)

        // Clean up after 30 seconds
        setTimeout(() => {
          clearInterval(interval)
          controller.close()
        }, 30000)
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
```

---

## Implementation Order

### Step 1: Core Infrastructure
- [ ] Add `ModuleExtension` interface to `module-loader.service.mts`
- [ ] Implement `extendModules()` method in `ModuleLoaderService`
- [ ] Implement `registerControllers()` private method
- [ ] Add `moduleLoader` to `PluginContext` interface
- [ ] Update `NaviosApplication.initPlugins()` to pass `moduleLoader`
- [ ] Export `ModuleExtension` from `@navios/core`
- [ ] Add tests for `extendModules()`

### Step 2: Package Setup
- [ ] Create package structure for `@navios/openapi-bun`
- [ ] Set up `package.json` with dependencies
- [ ] Configure `tsconfig.json` and `tsdown.config.mts`
- [ ] Set up `vitest.config.mts`

### Step 3: Options & Services
- [ ] Implement options schema (`options.schema.mts`)
- [ ] Create `OpenApiOptionsToken`
- [ ] Implement `OpenApiDocumentService`
- [ ] Add tests for document service

### Step 4: Controllers
- [ ] Implement `createOpenApiJsonController()`
- [ ] Implement `createOpenApiYamlController()`
- [ ] Implement `createOpenApiUiController()`
- [ ] Add tests for controllers

### Step 5: Plugin
- [ ] Implement `OpenApiBunPlugin`
- [ ] Implement `defineOpenApiPlugin()`
- [ ] Add integration tests
- [ ] Create public exports

### Step 6: Documentation & Examples
- [ ] Create example in `examples/openapi-bun/`
- [ ] Add documentation to docs site
- [ ] Update openapi guide to mention Bun adapter
- [ ] Add README

---

## API Summary

### Main Exports

```typescript
// Plugin
export { defineOpenApiPlugin } from '@navios/openapi-bun'

// Types
export type { BunOpenApiPluginOptions, ScalarOptions } from '@navios/openapi-bun'
```

### Usage

```typescript
app.usePlugin(defineOpenApiPlugin({
  // OpenAPI document info (required)
  info: {
    title: 'My API',
    version: '1.0.0',
  },

  // Endpoint paths (optional, with defaults)
  jsonPath: '/openapi.json',    // default
  yamlPath: '/openapi.yaml',    // default
  docsPath: '/docs',            // default

  // Disable specific endpoints (optional)
  disableJson: false,           // default
  disableYaml: true,            // default (YAML disabled by default)
  disableScalar: false,         // default

  // Scalar UI options (optional)
  scalar: {
    theme: 'purple',
    favicon: '/favicon.ico',
  },

  // Other OpenAPI options from @navios/openapi
  servers: [...],
  securitySchemes: {...},
  tags: [...],
}))
```

---

## Comparison: Fastify vs Bun Approach

| Aspect | Fastify | Bun |
|--------|---------|-----|
| Route registration | Direct on Fastify instance | Via `extendModules()` |
| Controllers | None (closure handlers) | Standard Navios controllers |
| In module tree | No | Yes |
| Request lifecycle | Fastify-native | Navios-native |
| Configuration | Via closure | Via DI token |
| Testability | Plugin testing | Controller unit tests |

---

## Dependencies

```json
{
  "dependencies": {
    "@scalar/core": "^0.1.0",
    "yaml": "^2.0.0"
  },
  "peerDependencies": {
    "@navios/core": "^0.7.0",
    "@navios/di": "^0.7.0",
    "@navios/openapi": "^0.1.0",
    "@navios/adapter-bun": "^0.7.0",
    "@navios/builder": "^0.7.0"
  }
}
```

---

## References

- [Existing OpenAPI spec](./navios-openapi.md)
- [Scalar Core Documentation](https://github.com/scalar/scalar/tree/main/packages/core)
- [Bun HTTP Server](https://bun.sh/docs/api/http)
