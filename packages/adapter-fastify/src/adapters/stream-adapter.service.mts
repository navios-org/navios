import type { BaseStreamConfig } from '@navios/builder'
import type { ClassType, HandlerMetadata, ScopedContainer } from '@navios/core'
import type { FastifyReply, FastifyRequest } from 'fastify'

import { Injectable, InjectionToken } from '@navios/core'

import type { FastifyHandlerAdapterInterface } from './handler-adapter.interface.mjs'

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
  provideHandler(
    controller: ClassType,
    handlerMetadata: HandlerMetadata<BaseStreamConfig>,
  ): (
    context: ScopedContainer,
    request: FastifyRequest,
    reply: FastifyReply,
  ) => Promise<any> {
    const getters = this.prepareArguments(handlerMetadata)
    const formatArguments = async (request: FastifyRequest) => {
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

    return async (
      context: ScopedContainer,
      request: FastifyRequest,
      reply: FastifyReply,
    ) => {
      const controllerInstance = await context.get(controller)
      const argument = await formatArguments(request)

      await controllerInstance[handlerMetadata.classMethod](argument, reply)
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
    handlerMetadata: HandlerMetadata<BaseStreamConfig>,
  ): Record<string, any> {
    const schema: Record<string, any> = {}
    const { querySchema, requestSchema } = handlerMetadata.config

    if (querySchema) {
      schema.querystring = querySchema
    }
    if (requestSchema) {
      schema.body = requestSchema
    }

    return schema
  }
}
