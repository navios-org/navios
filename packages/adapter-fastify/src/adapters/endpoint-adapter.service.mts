import type { EndpointOptions } from '@navios/builder'
import type {
  AbstractDynamicHandler,
  AbstractStaticHandler,
  FormatArgumentsFn,
  HandlerContext,
  HandlerMetadata,
  InstanceResolution,
} from '@navios/core'
import type { FastifyReply, FastifyRequest } from 'fastify'

import { Injectable, InjectionToken } from '@navios/core'

import { FastifyStreamAdapterService } from './stream-adapter.service.mjs'

/**
 * Injection token for the Fastify endpoint adapter service.
 *
 * This token is used to inject the `FastifyEndpointAdapterService` instance
 * into the dependency injection container.
 */
export const FastifyEndpointAdapterToken =
  InjectionToken.create<FastifyEndpointAdapterService>(
    Symbol.for('FastifyEndpointAdapterService'),
  )

/**
 * Adapter service for handling standard REST endpoint requests in Fastify.
 *
 * This service extends `FastifyStreamAdapterService` and provides specialized
 * handling for REST endpoints with request/response schema validation.
 * It automatically parses request bodies, query parameters, and URL parameters,
 * validates them against Zod schemas, and formats responses according to
 * response schemas using Fastify's schema system.
 *
 * @extends {FastifyStreamAdapterService}
 *
 * @example
 * ```ts
 * // Used automatically when defining endpoints with @Endpoint()
 * @Controller()
 * class UserController {
 *   @Endpoint({
 *     method: 'POST',
 *     url: '/users',
 *     requestSchema: createUserSchema,
 *     responseSchema: userSchema,
 *   })
 *   async createUser(data: CreateUserDto) {
 *     // data is validated against createUserSchema
 *     return { id: 1, ...data } // Response validated against userSchema
 *   }
 * }
 * ```
 */
@Injectable({
  token: FastifyEndpointAdapterToken,
})
export class FastifyEndpointAdapterService extends FastifyStreamAdapterService {
  /**
   * Checks if the handler has any validation schemas defined.
   *
   * @param handlerMetadata - The handler metadata containing configuration.
   * @returns `true` if the handler has request, query, or response schemas.
   */
  override hasSchema(
    handlerMetadata: HandlerMetadata<EndpointOptions>,
  ): boolean {
    const config = handlerMetadata.config
    return (
      super.hasSchema(handlerMetadata) ||
      (!!this.options.validateResponses && !!config.responseSchema)
    )
  }

  /**
   * Provides Fastify schema information for the handler.
   *
   * Creates a Fastify route schema object that includes request body, query string,
   * and response schemas. This enables Fastify's built-in validation and serialization.
   *
   * @param handlerMetadata - The handler metadata containing configuration and schemas.
   * @returns A Fastify route schema object.
   */
  override provideSchema(
    handlerMetadata: HandlerMetadata<EndpointOptions>,
  ): Record<string, any> {
    const config = handlerMetadata.config
    const schema = super.provideSchema(handlerMetadata)
    if (this.options.validateResponses && config.responseSchema) {
      schema.response = {
        ...config.errorSchema,
        200: config.responseSchema,
      }
    }

    return schema
  }

  /**
   * Creates a static handler for singleton controllers.
   *
   * Invokes the controller method and sends the response with proper status and headers.
   *
   * @param boundMethod - Pre-bound controller method
   * @param formatArguments - Function to format request arguments
   * @param context - Handler context with metadata
   * @returns Static handler result
   */
  protected override createStaticHandler(
    boundMethod: (...args: any[]) => Promise<any>,
    formatArguments: FormatArgumentsFn<FastifyRequest>,
    context: HandlerContext<EndpointOptions>,
  ): AbstractStaticHandler<FastifyRequest, FastifyReply> {
    const { statusCode, headers, hasArguments } = context

    if (hasArguments) {
      return {
        isStatic: true,
        handler: async (request: FastifyRequest, reply: FastifyReply) => {
          const argument = await formatArguments(request)
          const result = await boundMethod(argument)
          reply.status(statusCode).headers(headers).send(result)
        },
      }
    }

    const emptyArgs = Object.freeze({})
    return {
      isStatic: true,
      handler: async (_request: FastifyRequest, reply: FastifyReply) => {
        const result = await boundMethod(emptyArgs)
        reply.status(statusCode).headers(headers).send(result)
      },
    }
  }

  /**
   * Creates a dynamic handler for request-scoped controllers.
   *
   * Resolves the controller per-request and sends the response with proper status and headers.
   *
   * @param resolution - Instance resolution with resolve function
   * @param formatArguments - Function to format request arguments
   * @param context - Handler context with metadata
   * @returns Dynamic handler result
   */
  protected override createDynamicHandler(
    resolution: InstanceResolution,
    formatArguments: FormatArgumentsFn<FastifyRequest>,
    context: HandlerContext<EndpointOptions>,
  ): AbstractDynamicHandler<FastifyRequest, FastifyReply> {
    const { methodName, statusCode, headers, hasArguments } = context

    if (hasArguments) {
      return {
        isStatic: false,
        handler: async (
          scoped,
          request: FastifyRequest,
          reply: FastifyReply,
        ) => {
          const controllerInstance = (await resolution.resolve(scoped)) as any
          const argument = await formatArguments(request)
          const result = await controllerInstance[methodName](argument)
          reply.status(statusCode).headers(headers).send(result)
        },
      }
    }

    const emptyArgs = Object.freeze({})
    return {
      isStatic: false,
      handler: async (
        scoped,
        _request: FastifyRequest,
        reply: FastifyReply,
      ) => {
        const controllerInstance = (await resolution.resolve(scoped)) as any
        const result = await controllerInstance[methodName](emptyArgs)
        reply.status(statusCode).headers(headers).send(result)
      },
    }
  }
}
