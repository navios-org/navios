import type { BaseStreamConfig } from '@navios/builder'
import type { ClassType, HandlerMetadata, ScopedContainer } from '@navios/core'
import type { BunRequest } from 'bun'

import {
  InstanceResolverService,
  inject,
  Injectable,
  InjectionToken,
} from '@navios/core'

import type {
  BunHandlerAdapterInterface,
  BunHandlerResult,
} from './handler-adapter.interface.mjs'

/**
 * Injection token for the Bun stream adapter service.
 *
 * This token is used to inject the `BunStreamAdapterService` instance
 * into the dependency injection container.
 */
export const BunStreamAdapterToken =
  InjectionToken.create<BunStreamAdapterService>(
    Symbol.for('BunStreamAdapterService'),
  )

/**
 * Adapter service for handling streaming requests and responses in Bun.
 *
 * This service provides the base functionality for handling HTTP requests
 * with streaming capabilities. It handles request parsing, argument preparation,
 * and response formatting for stream-based endpoints.
 *
 * @implements {BunHandlerAdapterInterface}
 *
 * @example
 * ```ts
 * // Used automatically when defining endpoints with @Stream()
 * @Controller()
 * class StreamController {
 *   @Stream(streamEvents)
 *   async streamData(data: StreamDto) {
 *     // Returns a Response object for streaming
 *     return new Response(stream, {
 *       headers: { 'Content-Type': 'text/event-stream' },
 *     })
 *   }
 * }
 * ```
 */
@Injectable({
  token: BunStreamAdapterToken,
})
export class BunStreamAdapterService implements BunHandlerAdapterInterface {
  protected instanceResolver = inject(InstanceResolverService)

  /**
   * Checks if the handler has any validation schemas defined.
   *
   * @param handlerMetadata - The handler metadata containing configuration.
   * @returns `true` if the handler has request or query schemas.
   */
  hasSchema(handlerMetadata: HandlerMetadata<BaseStreamConfig>): boolean {
    const config = handlerMetadata.config
    return !!config.requestSchema || !!config.querySchema
  }

  /**
   * Prepares argument getters for parsing request data.
   *
   * This method creates an array of functions that extract and validate
   * data from the request (query parameters, request body, URL parameters).
   * Each getter function populates a target object with validated data.
   *
   * @param handlerMetadata - The handler metadata with schemas and configuration.
   * @returns An array of getter functions that populate request arguments.
   */
  prepareArguments(handlerMetadata: HandlerMetadata<BaseStreamConfig>) {
    const config = handlerMetadata.config
    const getters: ((
      target: Record<string, any>,
      request: BunRequest,
    ) => void | Promise<void>)[] = []
    if (config.querySchema) {
      const schema = config.querySchema
      getters.push((target, request) => {
        const url = new URL(request.url)
        // @ts-expect-error - schema is unknown type
        target.params = schema.parse(Object.fromEntries(url.searchParams))
      })
    }
    if (config.requestSchema) {
      const schema = config.requestSchema
      getters.push(async (target, request) => {
        // @ts-expect-error - schema is unknown type
        target.data = schema.parse(await request.json())
      })
    }
    if (config.url.includes('$')) {
      getters.push((target, request) => {
        target.urlParams = request.params
      })
    }

    return getters
  }

  /**
   * Creates a request handler function for streaming endpoints.
   *
   * This method generates a handler that:
   * 1. Parses and validates request data (body, query, URL params)
   * 2. Invokes the controller method with validated arguments
   * 3. Handles streaming responses (Response objects or raw data)
   * 4. Returns a properly formatted HTTP response
   *
   * @param controller - The controller class containing the handler method.
   * @param handlerMetadata - The handler metadata with configuration and schemas.
   * @returns A function that handles incoming requests and returns responses.
   */
  async provideHandler(
    controller: ClassType,
    handlerMetadata: HandlerMetadata<BaseStreamConfig>,
  ): Promise<BunHandlerResult> {
    const getters = this.prepareArguments(handlerMetadata)
    const hasArguments = getters.length > 0

    // Cache method name for faster property access
    const methodName = handlerMetadata.classMethod

    // Pre-compute headers
    const headersTemplate: Record<string, string> = {}
    for (const [key, value] of Object.entries(handlerMetadata.headers)) {
      headersTemplate[key] = String(value)
    }

    // Helper to handle stream response
    const handleStreamResult = (result: any) => {
      if (result instanceof Response) {
        for (const [key, value] of Object.entries(headersTemplate)) {
          result.headers.set(key, value)
        }
        return result
      }
      return new Response(result, {
        status: handlerMetadata.successStatusCode,
        headers: headersTemplate,
      })
    }

    // Resolve controller with automatic scope detection
    const resolution = await this.instanceResolver.resolve(controller)

    // Stream writer stub
    const streamWriter = {
      write: (_data: any) => {},
      end: () => {},
    }

    // Branch based on hasArguments to skip formatArguments entirely when not needed
    if (hasArguments) {
      // Detect if any getter is async at registration time
      const hasAsyncGetters = getters.some(
        (g) => g.constructor.name === 'AsyncFunction',
      )

      const formatArguments = hasAsyncGetters
        ? async (request: BunRequest) => {
            const argument: Record<string, any> = {}
            const promises: Promise<void>[] = []
            for (const getter of getters) {
              const res = getter(argument, request)
              if (res instanceof Promise) {
                promises.push(res)
              }
            }
            await Promise.all(promises)
            return argument
          }
        : (request: BunRequest) => {
            const argument: Record<string, any> = {}
            for (const getter of getters) {
              getter(argument, request)
            }
            return argument
          }

      if (resolution.cached) {
        const cachedController = resolution.instance as any
        // Pre-bind method for faster invocation
        const boundMethod = cachedController[methodName].bind(cachedController)
        return {
          isStatic: true,
          handler: async (request: BunRequest) => {
            const argument = await formatArguments(request)
            const result = await boundMethod(argument, streamWriter)
            return handleStreamResult(result)
          },
        }
      }

      return {
        isStatic: false,
        handler: async (scoped: ScopedContainer, request: BunRequest) => {
          const controllerInstance = (await resolution.resolve(scoped)) as any
          const argument = await formatArguments(request)
          const result = await controllerInstance[methodName](
            argument,
            streamWriter,
          )
          return handleStreamResult(result)
        },
      }
    }

    // No arguments path - skip formatArguments entirely
    const emptyArgs = Object.freeze({})
    if (resolution.cached) {
      const cachedController = resolution.instance as any
      // Pre-bind method for faster invocation
      const boundMethod = cachedController[methodName].bind(cachedController)
      return {
        isStatic: true,
        handler: async (_request: BunRequest) => {
          const result = await boundMethod(emptyArgs, streamWriter)
          return handleStreamResult(result)
        },
      }
    }

    return {
      isStatic: false,
      handler: async (scoped: ScopedContainer, _request: BunRequest) => {
        const controllerInstance = (await resolution.resolve(scoped)) as any
        const result = await controllerInstance[methodName](
          emptyArgs,
          streamWriter,
        )
        return handleStreamResult(result)
      },
    }
  }

  /**
   * Provides schema information for the handler.
   *
   * For Bun adapter, this returns an empty object as Bun doesn't require
   * schema registration like some other frameworks.
   *
   * @param _handlerMetadata - The handler metadata containing configuration.
   * @returns An empty schema object.
   */
  provideSchema(
    _handlerMetadata: HandlerMetadata<BaseStreamConfig>,
  ): Record<string, any> {
    // For Bun, no schema, return empty
    return {}
  }
}
