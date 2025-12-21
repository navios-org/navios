import type { BaseEndpointConfig } from '@navios/builder'
import type {
  ClassType,
  HandlerMetadata,
  NaviosApplicationOptions,
  ScopedContainer,
} from '@navios/core'
import type { FastifyReply, FastifyRequest } from 'fastify'

import {
  Injectable,
  InjectionToken,
  NaviosOptionsToken,
  optional,
} from '@navios/core'

import type { FastifyHandlerResult } from './handler-adapter.interface.mjs'

import { FastifyStreamAdapterService } from './stream-adapter.service.mjs'

const defaultOptions: NaviosApplicationOptions = {
  adapter: [],
  validateResponses: true,
  enableRequestId: false,
}

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
  private options = optional(NaviosOptionsToken) ?? defaultOptions

  /**
   * Checks if the handler has any validation schemas defined.
   *
   * @param handlerMetadata - The handler metadata containing configuration.
   * @returns `true` if the handler has request, query, or response schemas.
   */
  override hasSchema(
    handlerMetadata: HandlerMetadata<BaseEndpointConfig>,
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
    handlerMetadata: HandlerMetadata<BaseEndpointConfig>,
  ): Record<string, any> {
    const config = handlerMetadata.config
    const schema = super.provideSchema(handlerMetadata)
    if (this.options.validateResponses && config.responseSchema) {
      schema.response = {
        200: config.responseSchema,
      }
    }

    return schema
  }

  /**
   * Creates a request handler function for the endpoint.
   *
   * This method generates a handler that:
   * 1. Parses and validates request data (body, query, URL params)
   * 2. Invokes the controller method with validated arguments
   * 3. Validates and formats the response according to the response schema
   * 4. Sends the response using Fastify's reply object
   *
   * @param controller - The controller class containing the handler method.
   * @param handlerMetadata - The handler metadata with configuration and schemas.
   * @returns A function that handles incoming requests and sends responses.
   */
  override async provideHandler(
    controller: ClassType,
    handlerMetadata: HandlerMetadata<BaseEndpointConfig>,
  ): Promise<FastifyHandlerResult> {
    const getters = this.prepareArguments(handlerMetadata)
    const hasArguments = getters.length > 0

    // Cache method name for faster property access
    const methodName = handlerMetadata.classMethod

    // Resolve controller with automatic scope detection
    const resolution = await this.instanceResolver.resolve(controller)

    // Pre-compute status code and headers
    const statusCode = handlerMetadata.successStatusCode
    const headers = handlerMetadata.headers

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
            const result = await boundMethod(argument)
            reply.status(statusCode).headers(headers).send(result)
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
          const result = await controllerInstance[methodName](argument)
          reply.status(statusCode).headers(headers).send(result)
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
          const result = await boundMethod(emptyArgs)
          reply.status(statusCode).headers(headers).send(result)
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
        const result = await controllerInstance[methodName](emptyArgs)
        reply.status(statusCode).headers(headers).send(result)
      },
    }
  }
}
