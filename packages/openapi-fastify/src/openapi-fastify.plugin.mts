import type {
  NaviosPlugin,
  PluginContext,
  PluginDefinition,
} from '@navios/core'
import type { OpenApiGeneratorOptions } from '@navios/openapi'
import type { FastifyReply, FastifyRequest } from 'fastify'

import type { FastifyApplicationServiceInterface } from '@navios/adapter-fastify'

import { OpenApiGeneratorService } from '@navios/openapi'

import { getHtmlDocument } from '@scalar/core/libs/html-rendering'
import { stringify as yamlStringify } from 'yaml'

import type {
  FastifyOpenApiPluginOptionsBase,
  ScalarOptions,
  ScalarTheme,
} from './schemas/index.mjs'

import { fastifyOpenApiPluginOptionsSchema } from './schemas/index.mjs'
import { applyGlobalPrefix } from './utils/index.mjs'

/**
 * Combined options for the Fastify OpenAPI plugin.
 * Extends OpenApiGeneratorOptions with Fastify-specific settings.
 */
export interface FastifyOpenApiPluginOptions
  extends OpenApiGeneratorOptions, Partial<FastifyOpenApiPluginOptionsBase> {}

/**
 * Class-based OpenAPI Fastify plugin that integrates with Navios plugin system.
 *
 * This plugin:
 * - Scans all registered modules for endpoints
 * - Generates an OpenAPI 3.1 document
 * - Serves the document as JSON and optionally YAML
 * - Provides Scalar UI for interactive documentation
 */
export class OpenApiFastifyPlugin implements NaviosPlugin<FastifyOpenApiPluginOptions, FastifyApplicationServiceInterface> {
  readonly name = 'openapi-fastify'

  async register(
    context: PluginContext<FastifyApplicationServiceInterface>,
    options: FastifyOpenApiPluginOptions,
  ): Promise<void> {
    const fastify = context.adapter.getServer()
    const globalPrefix = context.adapter.getGlobalPrefix()

    // Parse and validate options with defaults
    const parsedOptions = fastifyOpenApiPluginOptionsSchema.parse(options)

    // Get the generator service from the container
    const generator = await context.container.get(OpenApiGeneratorService)

    // Generate OpenAPI document from discovered endpoints
    const document = generator.generate(context.modules, options)

    // Apply global prefix to servers if not already set
    const documentWithServers = applyGlobalPrefix(
      document,
      globalPrefix,
      options,
    )

    // Register JSON endpoint
    const jsonPath = parsedOptions.jsonPath
    fastify.get(jsonPath, async (_request: FastifyRequest, reply: FastifyReply) => {
      return reply.send(documentWithServers)
    })

    // Register YAML endpoint (disabled by default)
    if (!parsedOptions.disableYaml) {
      const yamlPath = parsedOptions.yamlPath
      fastify.get(yamlPath, async (_request: FastifyRequest, reply: FastifyReply) => {
        reply.type('text/yaml')
        return reply.send(yamlStringify(documentWithServers))
      })
    }

    // Register Scalar UI (unless disabled)
    if (!parsedOptions.disableScalar) {
      const docsPath = parsedOptions.docsPath
      const scalarOptions = options.scalar ?? {}

      // Generate HTML document using @scalar/core
      const html = this.generateScalarHtml(jsonPath, scalarOptions)

      fastify.get(docsPath, async (_request: FastifyRequest, reply: FastifyReply) => {
        reply.type('text/html')
        return reply.send(html)
      })
    }
  }

  /**
   * Generates the Scalar API Reference HTML document.
   *
   * @param specUrl - URL to the OpenAPI JSON specification
   * @param options - Scalar UI configuration options
   * @returns Complete HTML document string
   */
  private generateScalarHtml(specUrl: string, options: ScalarOptions): string {
    return getHtmlDocument({
      url: specUrl,
      theme: options.theme ?? 'default',
      favicon: options.favicon,
      customCss: options.customCss,
      hideDownloadButton: options.hideDownloadButton,
      hideSearch: options.hideSearch,
      metaData: options.metaData,
      cdn: options.cdn,
      pageTitle: options.metaData?.title ?? 'API Reference',
    })
  }
}

/**
 * Creates a plugin definition for the OpenAPI Fastify plugin.
 *
 * @param options - Plugin configuration options
 * @returns Plugin definition to pass to `app.usePlugin()`
 *
 * @example
 * ```typescript
 * import { NaviosFactory } from '@navios/core'
 * import { defineFastifyEnvironment } from '@navios/adapter-fastify'
 * import { defineOpenApiPlugin } from '@navios/openapi-fastify'
 *
 * const app = await NaviosFactory.create(AppModule, {
 *   adapter: defineFastifyEnvironment(),
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
 *   securitySchemes: {
 *     bearerAuth: {
 *       type: 'http',
 *       scheme: 'bearer',
 *       bearerFormat: 'JWT',
 *     },
 *   },
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
  options: FastifyOpenApiPluginOptions,
): PluginDefinition<FastifyOpenApiPluginOptions> {
  return {
    plugin: new OpenApiFastifyPlugin(),
    options,
  }
}

// Re-export types for convenience
export type { ScalarOptions, ScalarTheme }
