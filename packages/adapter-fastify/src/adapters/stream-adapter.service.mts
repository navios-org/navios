import type { BaseEndpointOptions } from '@navios/builder'
import type {
  ClassType,
  HandlerMetadata,
  NaviosApplicationOptions,
  ScopedContainer,
} from '@navios/core'
import type { FastifyReply, FastifyRequest } from 'fastify'

import {
  inject,
  Injectable,
  InjectionToken,
  InstanceResolverService,
  NaviosOptionsToken,
  optional,
} from '@navios/core'

import type {
  FastifyHandlerAdapterInterface,
  FastifyHandlerResult,
} from './handler-adapter.interface.mjs'

const defaultOptions: NaviosApplicationOptions = {
  adapter: [],
  validateResponses: true,
  enableRequestId: false,
}

/**
 * Injection token for the Fastify stream adapter service.
 *
 * This token is used to inject the `FastifyStreamAdapterService` instance
 * into the dependency injection container.
 */
export const FastifyStreamAdapterToken =
  InjectionToken.create<FastifyStreamAdapterService>(
    Symbol.for('FastifyStreamAdapterService'),
  )

/**
 * Adapter service for handling streaming requests and responses in Fastify.
 *
 * This service provides the base functionality for handling HTTP requests
 * with streaming capabilities. It handles request parsing, argument preparation,
 * and response formatting for stream-based endpoints. Handlers receive the
 * Fastify reply object for direct control over the response stream.
 *
 * @implements {FastifyHandlerAdapterInterface}
 *
 * @example
 * ```ts
 * // Used automatically when defining endpoints with @Stream()
 * @Controller()
 * class StreamController {
 *   @Stream(streamEvents)
 *   async streamData(data: StreamDto, reply: FastifyReply) {
 *     reply.type('text/event-stream')
 *     // Use reply object to stream data
 *     reply.send(stream)
 *   }
 * }
 * ```
 */
@Injectable({
  token: FastifyStreamAdapterToken,
})
export class FastifyStreamAdapterService implements FastifyHandlerAdapterInterface {
  protected instanceResolver = inject(InstanceResolverService)
  protected options = optional(NaviosOptionsToken) ?? defaultOptions

  /**
   * Checks if the handler has any validation schemas defined.
   *
   * @param handlerMetadata - The handler metadata containing configuration.
   * @returns `true` if the handler has request or query schemas.
   */
  hasSchema(handlerMetadata: HandlerMetadata<BaseEndpointOptions>): boolean {
    const config = handlerMetadata.config
    return (
      !!config.requestSchema ||
      !!config.querySchema ||
      (!!this.options.validateResponses && !!config.errorSchema)
    )
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
  prepareArguments(handlerMetadata: HandlerMetadata<BaseEndpointOptions>) {
    const config = handlerMetadata.config
    const getters: ((
      target: Record<string, any>,
      request: FastifyRequest,
    ) => void | Promise<void>)[] = []
    if (config.querySchema) {
      getters.push((target, request) => {
        target.params = request.query
      })
    }
    if (config.requestSchema) {
      getters.push((target, request) => {
        target.data = request.body
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
   * 2. Invokes the controller method with validated arguments and the reply object
   * 3. Allows the handler to control the response stream directly
   *
   * @param controller - The controller class containing the handler method.
   * @param handlerMetadata - The handler metadata with configuration and schemas.
   * @returns A function that handles incoming requests and sends responses.
   */
  async provideHandler(
    controller: ClassType,
    handlerMetadata: HandlerMetadata<BaseEndpointOptions>,
  ): Promise<FastifyHandlerResult> {
    const getters = this.prepareArguments(handlerMetadata)
    const hasArguments = getters.length > 0

    // Cache method name for faster property access
    const methodName = handlerMetadata.classMethod

    // Resolve controller with automatic scope detection
    const resolution = await this.instanceResolver.resolve(controller)

    // Branch based on hasArguments to skip formatArguments entirely when not needed
    if (hasArguments) {
      // Detect if any getter is async at registration time
      const hasAsyncGetters = getters.some(
        (g) => g.constructor.name === 'AsyncFunction',
      )

      const formatArguments = hasAsyncGetters
        ? async (request: FastifyRequest) => {
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
        : (request: FastifyRequest) => {
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
          handler: async (request: FastifyRequest, reply: FastifyReply) => {
            const argument = await formatArguments(request)
            await boundMethod(argument, reply)
          },
        }
      }

      return {
        isStatic: false,
        handler: async (
          scoped: ScopedContainer,
          request: FastifyRequest,
          reply: FastifyReply,
        ) => {
          const controllerInstance = (await resolution.resolve(scoped)) as any
          const argument = await formatArguments(request)
          await controllerInstance[methodName](argument, reply)
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
        handler: async (_request: FastifyRequest, reply: FastifyReply) => {
          await boundMethod(emptyArgs, reply)
        },
      }
    }

    return {
      isStatic: false,
      handler: async (
        scoped: ScopedContainer,
        _request: FastifyRequest,
        reply: FastifyReply,
      ) => {
        const controllerInstance = (await resolution.resolve(scoped)) as any
        await controllerInstance[methodName](emptyArgs, reply)
      },
    }
  }

  /**
   * Provides Fastify schema information for the handler.
   *
   * Creates a Fastify route schema object that includes request body and
   * query string schemas. This enables Fastify's built-in validation.
   *
   * @param handlerMetadata - The handler metadata containing configuration and schemas.
   * @returns A Fastify route schema object.
   */
  provideSchema(
    handlerMetadata: HandlerMetadata<BaseEndpointOptions>,
  ): Record<string, any> {
    const schema: Record<string, any> = {}
    const { querySchema, requestSchema, errorSchema } = handlerMetadata.config

    if (querySchema) {
      schema.querystring = querySchema
    }
    if (requestSchema) {
      schema.body = requestSchema
    }
    if (this.options.validateResponses && errorSchema) {
      schema.response = {
        ...errorSchema,
      }
    }

    return schema
  }
}
