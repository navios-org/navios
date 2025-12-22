import type {
  ClassType,
  NaviosPlugin,
  PluginContext,
  PluginDefinition,
} from '@navios/core'

import type { ScalarOptions, ScalarTheme } from './schemas/index.mjs'
import type { BunOpenApiPluginOptions } from './tokens/openapi-options.token.mjs'

import { createOpenApiJsonController } from './controllers/openapi-json.controller.mjs'
import { createOpenApiUiController } from './controllers/openapi-ui.controller.mjs'
import { createOpenApiYamlController } from './controllers/openapi-yaml.controller.mjs'
import { bunOpenApiPluginOptionsSchema } from './schemas/index.mjs'
import { OpenApiDocumentService } from './services/openapi-document.service.mjs'
import { OpenApiOptionsToken } from './tokens/openapi-options.token.mjs'

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
    const parsedOptions = bunOpenApiPluginOptionsSchema.parse(options)
    const fullOptions = { ...options, ...parsedOptions }

    // Step 1: Register options in DI container
    this.registerOptions(context, fullOptions)

    // Step 2: Register document service and initialize it
    await this.initializeDocumentService(context, fullOptions)

    // Step 3: Create and register controllers based on options
    const controllers = this.createControllers(parsedOptions)

    // Step 4: Extend modules with our controllers
    if (controllers.length > 0) {
      await context.moduleLoader.extendModules([
        {
          controllers,
          moduleName: 'OpenApiBunModule',
        },
      ])
    }
  }

  /**
   * Registers the plugin options in the DI container.
   */
  private registerOptions(
    context: PluginContext,
    options: BunOpenApiPluginOptions,
  ): void {
    context.container.addInstance(OpenApiOptionsToken, options)
  }

  /**
   * Registers and initializes the document service.
   */
  private async initializeDocumentService(
    context: PluginContext,
    _options: BunOpenApiPluginOptions,
  ): Promise<void> {
    // Get the document service from container (triggers DI registration)
    const documentService = await context.container.get(OpenApiDocumentService)

    // Initialize with modules and global prefix
    documentService.initialize(context.modules, context.globalPrefix)
  }

  /**
   * Creates controller classes based on options.
   */
  private createControllers(
    options: ReturnType<typeof bunOpenApiPluginOptionsSchema.parse>,
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
        createOpenApiUiController(options.docsPath, options.jsonPath),
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
