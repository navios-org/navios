import { definePlugin, handler, Logger, registerController, registerModule } from '@navios/core'
import { getHtmlDocument } from '@scalar/core/libs/html-rendering'
import { stringify as yamlStringify } from 'yaml'

import type { FieldHandler, RouteInfo } from '@navios/core'

import { ApiExclude } from './decorators.mjs'
import { generateOpenApiDocument, toOpenApiPath } from './document.mjs'

import type { OpenApiGenerationOptions } from './document.mjs'
import type { OpenApiDocument } from './types.mjs'

export type ScalarTheme =
  | 'default'
  | 'alternate'
  | 'moon'
  | 'purple'
  | 'solarized'
  | 'bluePlanet'
  | 'saturn'
  | 'kepler'
  | 'mars'
  | 'deepSpace'
  | 'laserwave'
  | 'elysiajs'
  | 'fastify'
  | 'none'

export interface ScalarMetaData {
  title?: string
  description?: string
  ogDescription?: string
  ogTitle?: string
  ogImage?: string
  twitterCard?: string
}

/** Options of the Scalar API reference page. */
export interface ScalarOptions {
  /** @default 'default' */
  theme?: ScalarTheme
  favicon?: string
  hideDownloadButton?: boolean
  hideSearch?: boolean
  customCss?: string
  /** Meta tags of the page. `title` is also the page title. */
  metaData?: ScalarMetaData
  /** Where to load `@scalar/api-reference` from. */
  cdn?: string
}

export interface OpenApiPluginOptions extends Omit<OpenApiGenerationOptions, 'logger'> {
  /**
   * Path of the JSON document, relative to the global prefix.
   * @default '/openapi.json'
   */
  jsonPath?: string
  /**
   * Path of the YAML document, relative to the global prefix.
   * @default '/openapi.yaml'
   */
  yamlPath?: string
  /**
   * Path of the Scalar API reference page, relative to the global prefix.
   * @default '/docs'
   */
  docsPath?: string
  scalar?: ScalarOptions
  /** @default false */
  disableJson?: boolean
  /** @default true */
  disableYaml?: boolean
  /** @default false */
  disableScalar?: boolean
  /**
   * Called with the generated document before it is served; may change it
   * in place or return another one.
   */
  transformDocument?: (
    document: OpenApiDocument,
    routes: readonly RouteInfo[],
  ) => OpenApiDocument | void
}

function renderScalar(
  options: ScalarOptions,
  source: { url: string } | { content: OpenApiDocument },
): string {
  return getHtmlDocument({
    ...source,
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

/**
 * Generates an OpenAPI 3.1 document from the application's routes and serves
 * it, with a Scalar API reference page. It works with every adapter, because
 * the routes it adds are ordinary Navios routes.
 *
 * ```ts
 * const app = await NaviosFactory.create(AppModule, {
 *   adapter: defineFastifyEnvironment(),
 *   plugins: [openApiPlugin({ info: { title: 'My API', version: '1.0.0' } })],
 * })
 * await app.listen({ port: 3000 })
 * // GET /openapi.json, GET /docs
 * ```
 *
 * The routes get the application's global prefix. The document is built once,
 * while the application initialises.
 */
export const openApiPlugin = definePlugin({
  name: 'openapi',
  async setup(api, options: OpenApiPluginOptions) {
    const logger = await api.container.get(Logger, { context: 'OpenApi' })
    const {
      jsonPath = '/openapi.json',
      yamlPath = '/openapi.yaml',
      docsPath = '/docs',
      disableJson = false,
      disableYaml = true,
      disableScalar = false,
      scalar = {},
      transformDocument,
      ...generation
    } = options

    let document: OpenApiDocument | null = null
    let yaml: string | null = null
    let html: string | null = null
    let jsonUrl: string | null = null

    const ready = (): OpenApiDocument => {
      if (document === null) {
        throw new Error(
          '[OpenAPI] The document is not generated until the application is initialised',
        )
      }
      return document
    }

    const attributes = [ApiExclude()]
    const handlers: Record<string, FieldHandler> = {}
    if (!disableJson) {
      handlers.json = handler({ config: { method: 'GET', url: jsonPath } }, { attributes }, () =>
        ready(),
      ) as FieldHandler
    }
    if (!disableYaml) {
      handlers.yaml = handler(
        { config: { method: 'GET', url: yamlPath, response: 'text' } },
        { attributes },
        (_params, ctx) => {
          ctx.reply.header('content-type', 'text/yaml; charset=utf-8')
          return (yaml ??= yamlStringify(ready()))
        },
      ) as FieldHandler
    }
    if (!disableScalar) {
      handlers.docs = handler(
        { config: { method: 'GET', url: docsPath, response: 'text' } },
        { attributes },
        (_params, ctx) => {
          ctx.reply.header('content-type', 'text/html; charset=utf-8')
          return (html ??= renderScalar(
            scalar,
            jsonUrl === null ? { content: ready() } : { url: jsonUrl },
          ))
        },
      ) as FieldHandler
    }
    // Handlers are fields of the instance, the form core discovers at boot.
    class OpenApiController {
      constructor() {
        Object.assign(this, handlers)
      }
    }
    registerController(OpenApiController)

    class OpenApiModule {}
    registerModule(OpenApiModule, { controllers: [OpenApiController] })

    api.addModule(OpenApiModule)

    api.onBootstrap((routes) => {
      const generated = generateOpenApiDocument(routes, {
        ...generation,
        logger: {
          warn: (message) => logger.warn(message),
          debug: (message) => logger.debug(message),
        },
      })
      document = transformDocument?.(generated, routes) ?? generated
      const jsonRoute = routes.find(
        (route) => route.controller === OpenApiController && route.handlerName === 'json',
      )
      jsonUrl = jsonRoute ? toOpenApiPath(jsonRoute.path) : null
    })
  },
})

/**
 * @deprecated Renamed to {@link openApiPlugin}.
 */
export const defineOpenApiPlugin = openApiPlugin
