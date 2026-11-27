import {
  definePlugin,
  handler,
  httpTransport,
  Logger,
  registerController,
  registerModule,
} from '@navios/server'
import { stringify as yamlStringify } from 'yaml'

import type { FieldHandler, RouteInfo } from '@navios/server'

import { ApiExclude } from '../annotations/index.mjs'
import { generateOpenApiDocument } from '../document/generate-document.mjs'
import { toOpenApiPath } from '../document/openapi-path.mjs'

import type { OpenApiGenerationOptions } from '../document/generate-document.mjs'
import type { OpenApiDocument } from '../document/openapi-document.mjs'

import { renderScalar } from './scalar-page.mjs'

import type { ScalarOptions } from './scalar-page.mjs'

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
  /**
   * Serve the JSON document. When `false`, the Scalar page embeds the
   * document instead of loading it.
   * @default true
   */
  json?: boolean
  /**
   * Serve the YAML document.
   * @default false
   */
  yaml?: boolean
  /**
   * Serve the Scalar API reference page: `false` leaves it out, an object
   * configures it.
   * @default true
   */
  scalar?: boolean | ScalarOptions
  /**
   * Called with the generated document before it is served; may change it
   * in place or return another one.
   */
  transformDocument?: (
    document: OpenApiDocument,
    routes: readonly RouteInfo[],
  ) => OpenApiDocument | void
}

/** A path as an endpoint declares it, whatever slashes are around it. */
function toUrl(path: string): string {
  const trimmed = path.replace(/^\/+|\/+$/g, '')
  return trimmed === '' ? '' : `/${trimmed}`
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
    const http = api.transport(httpTransport)
    if (!http) {
      throw new Error('[Navios] @navios/openapi needs the HTTP transport.')
    }
    const logger = await api.container.get(Logger, { context: 'OpenApi' })
    const {
      jsonPath = '/openapi.json',
      yamlPath = '/openapi.yaml',
      docsPath = '/docs',
      json = true,
      yaml: serveYaml = false,
      scalar = true,
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
    if (json) {
      handlers.json = handler(
        { config: { method: 'GET', url: toUrl(jsonPath) } },
        { attributes },
        () => ready(),
      ) as FieldHandler
    }
    if (serveYaml) {
      handlers.yaml = handler(
        { config: { method: 'GET', url: toUrl(yamlPath), response: 'text' } },
        { attributes },
        (_params, ctx) => {
          ctx.reply.header('content-type', 'text/yaml; charset=utf-8')
          return (yaml ??= yamlStringify(ready()))
        },
      ) as FieldHandler
    }
    if (scalar !== false) {
      const scalarOptions = scalar === true ? {} : scalar
      handlers.docs = handler(
        { config: { method: 'GET', url: toUrl(docsPath), response: 'text' } },
        { attributes },
        (_params, ctx) => {
          ctx.reply.header('content-type', 'text/html; charset=utf-8')
          return (html ??= renderScalar(
            scalarOptions,
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

    api.onBootstrap(() => {
      const routes = http.routes()
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
