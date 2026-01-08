import type {
  AbstractHttpHandlerAdapterInterface,
  ClassType,
  HandlerMetadata,
  HandlerResult,
  ScopedContainer,
} from '@navios/core'

import {
  inject,
  Injectable,
  InstanceResolverService,
  StreamAdapterToken,
} from '@navios/core'

import type { BaseXmlStreamConfig } from '../types/config.mjs'
import type { AnyXmlNode } from '../types/xml-node.mjs'

import { renderToXml } from '../runtime/render-to-xml.mjs'

/**
 * Adapter service for handling XML Stream endpoints in Navios.
 *
 * This service integrates with the base stream adapter (Fastify or Bun) to handle
 * XML endpoints that return JSX-based XML responses. It automatically renders JSX
 * nodes to XML strings and sends them with the appropriate Content-Type headers.
 *
 * The service supports:
 * - Async components (resolved in parallel)
 * - Class components (resolved via DI container)
 * - Regular JSX elements
 * - CDATA sections
 * - Raw XML content
 *
 * @implements {AbstractHttpHandlerAdapterInterface}
 *
 * @example
 * ```ts
 * // This service is automatically registered when using defineXmlEnvironment()
 * // and is used by endpoints decorated with @XmlStream()
 * ```
 */
@Injectable()
export class XmlStreamAdapterService implements AbstractHttpHandlerAdapterInterface {
  /** Base stream adapter - we proxy hasSchema, prepareArguments, provideSchema to it */
  protected streamAdapter = inject(StreamAdapterToken)
  protected instanceResolver = inject(InstanceResolverService)

  /**
   * Prepares argument getters for parsing request data.
   *
   * Proxies to the base stream adapter to reuse existing argument preparation logic
   * that handles query parameters, request body, and URL parameters for both
   * Fastify and Bun adapters.
   *
   * @param handlerMetadata - The handler metadata with schemas and configuration.
   * @returns An array of getter functions that populate request arguments.
   */
  prepareArguments(handlerMetadata: HandlerMetadata<BaseXmlStreamConfig>) {
    return this.streamAdapter.prepareArguments?.(handlerMetadata) ?? []
  }

  /**
   * Builds a formatArguments function from argument getters.
   *
   * Proxies to the base stream adapter to reuse the optimized formatArguments
   * logic that handles sync/async detection and empty args optimization.
   *
   * @param getters - Array of argument getter functions
   * @returns Function to format arguments from request
   */
  buildFormatArguments(
    getters: ((
      target: Record<string, any>,
      request: any,
    ) => void | Promise<void>)[],
  ) {
    return this.streamAdapter.buildFormatArguments?.(getters) ?? (() => ({}))
  }

  /**
   * Provides schema information for the handler.
   *
   * Proxies to the base stream adapter to reuse existing schema generation logic.
   * For Fastify, this enables built-in validation. For Bun, this returns an empty object.
   *
   * @param handlerMetadata - The handler metadata containing configuration and schemas.
   * @returns Schema information (Fastify route schema or empty object for Bun).
   */
  provideSchema(
    handlerMetadata: HandlerMetadata<BaseXmlStreamConfig>,
  ): Record<string, any> {
    if (
      'provideSchema' in this.streamAdapter &&
      typeof this.streamAdapter.provideSchema === 'function'
    ) {
      return this.streamAdapter.provideSchema(handlerMetadata)
    }
    return {}
  }

  /**
   * Checks if the handler has any validation schemas defined.
   *
   * Proxies to the base stream adapter to check for query or request schemas.
   *
   * @param handlerMetadata - The handler metadata containing configuration.
   * @returns `true` if the handler has any schemas (query or request).
   */
  hasSchema(handlerMetadata: HandlerMetadata<any>): boolean {
    if (
      'hasSchema' in this.streamAdapter &&
      typeof this.streamAdapter.hasSchema === 'function'
    ) {
      return this.streamAdapter.hasSchema(handlerMetadata)
    }
    return false
  }

  /**
   * Creates a request handler function for XML Stream endpoints.
   *
   * This method generates a handler that:
   * 1. Parses and validates request data (body, query, URL params) using the base adapter
   * 2. Invokes the controller method with validated arguments (returns JSX)
   * 3. Renders the JSX tree to XML string (resolves async and class components)
   * 4. Sends the XML response with appropriate Content-Type header
   *
   * The handler automatically detects the environment (Fastify vs Bun) and uses the
   * appropriate response mechanism (reply object vs Response object).
   *
   * @param controller - The controller class containing the handler method.
   * @param handlerMetadata - The handler metadata with configuration and schemas.
   * @returns A function that handles incoming requests and sends XML responses.
   */
  async provideHandler(
    controller: ClassType,
    handlerMetadata: HandlerMetadata<BaseXmlStreamConfig>,
  ): Promise<HandlerResult> {
    const getters = this.prepareArguments(handlerMetadata)
    const formatArguments = this.buildFormatArguments(getters)
    const config = handlerMetadata.config

    const contentType = config.contentType ?? 'application/xml'

    // Cache method name for faster property access
    const methodName = handlerMetadata.classMethod

    // Helper to send response based on environment
    const sendResponse = (
      xml: string,
      reply: any,
      headers: Record<string, string>,
    ) => {
      // Environment detection: Bun doesn't have reply
      const isHttpStandardEnvironment = reply === undefined

      if (isHttpStandardEnvironment) {
        // Bun: return Response object
        return new Response(xml, {
          status: handlerMetadata.successStatusCode,
          headers,
        })
      } else {
        // Fastify: use reply object
        reply
          .status(handlerMetadata.successStatusCode)
          .header('Content-Type', contentType)
          .headers(handlerMetadata.headers)
          .send(xml)
      }
    }

    // Pre-compute headers
    const headersTemplate: Record<string, string> = {
      'Content-Type': contentType,
    }
    for (const [key, value] of Object.entries(handlerMetadata.headers)) {
      if (value != null) {
        headersTemplate[key] = String(value)
      }
    }

    // Resolve controller with automatic scope detection
    const resolution = await this.instanceResolver.resolve(controller)

    // XML adapter always returns dynamic handler because renderToXml needs ScopedContainer
    // for resolving class components. Even if the controller is cached, we still need
    // the scoped container for the XML rendering phase.

    // Pre-compute render options
    const renderOptions = {
      declaration: config.xmlDeclaration ?? true,
      encoding: config.encoding ?? 'UTF-8',
    }

    if (resolution.cached) {
      const cachedController = resolution.instance as any
      // Pre-bind method for faster invocation
      const boundMethod = cachedController[methodName].bind(cachedController)
      return {
        isStatic: false,
        handler: async (context: ScopedContainer, request: any, reply: any) => {
          const argument = await formatArguments(request)
          const xmlNode: AnyXmlNode = await boundMethod(argument)
          const xml = await renderToXml(xmlNode, {
            ...renderOptions,
            container: context,
          })
          return sendResponse(xml, reply, headersTemplate)
        },
      }
    }

    return {
      isStatic: false,
      handler: async (context: ScopedContainer, request: any, reply: any) => {
        const controllerInstance = (await resolution.resolve(context)) as any
        const argument = await formatArguments(request)
        const xmlNode: AnyXmlNode =
          await controllerInstance[methodName](argument)
        const xml = await renderToXml(xmlNode, {
          ...renderOptions,
          container: context,
        })
        return sendResponse(xml, reply, headersTemplate)
      },
    }
  }
}
