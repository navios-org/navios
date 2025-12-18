import type { BaseEndpointConfig } from '@navios/builder'
import type { ClassType, HandlerMetadata, ScopedContainer } from '@navios/core'
import type { BunRequest } from 'bun'

import { Injectable, InjectionToken } from '@navios/core'

import { BunStreamAdapterService } from './stream-adapter.service.mjs'

/**
 * Injection token for the Bun endpoint adapter service.
 *
 * This token is used to inject the `BunEndpointAdapterService` instance
 * into the dependency injection container.
 */
export const BunEndpointAdapterToken =
  InjectionToken.create<BunEndpointAdapterService>(
    Symbol.for('BunEndpointAdapterService'),
  )

/**
 * Adapter service for handling standard REST endpoint requests in Bun.
 *
 * This service extends `BunStreamAdapterService` and provides specialized
 * handling for REST endpoints with request/response schema validation.
 * It automatically parses request bodies, query parameters, and URL parameters,
 * validates them against Zod schemas, and formats responses according to
 * response schemas.
 *
 * @extends {BunStreamAdapterService}
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
  token: BunEndpointAdapterToken,
})
export class BunEndpointAdapterService extends BunStreamAdapterService {
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
    return super.hasSchema(handlerMetadata) || !!config.responseSchema
  }

  /**
   * Provides schema information for the handler.
   *
   * For Bun adapter, this returns an empty object as Bun doesn't require
   * schema registration like some other frameworks.
   *
   * @param handlerMetadata - The handler metadata containing configuration.
   * @returns An empty schema object.
   */
  override provideSchema(
    handlerMetadata: HandlerMetadata<BaseEndpointConfig>,
  ): Record<string, any> {
    // For Bun, no schema
    return {}
  }

  /**
   * Creates a request handler function for the endpoint.
   *
   * This method generates a handler that:
   * 1. Parses and validates request data (body, query, URL params)
   * 2. Invokes the controller method with validated arguments
   * 3. Validates and formats the response according to the response schema
   * 4. Returns a properly formatted HTTP response
   *
   * @param controller - The controller class containing the handler method.
   * @param handlerMetadata - The handler metadata with configuration and schemas.
   * @returns A function that handles incoming requests and returns responses.
   */
  override provideHandler(
    controller: ClassType,
    handlerMetadata: HandlerMetadata<BaseEndpointConfig>,
  ): (context: ScopedContainer, request: BunRequest) => Promise<Response> {
    const getters = this.prepareArguments(handlerMetadata)
    const formatArguments = async (request: BunRequest) => {
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
    const responseSchema = handlerMetadata.config.responseSchema
    const formatResponse = responseSchema
      ? (result: any) => {
          return responseSchema.parse(result)
        }
      : (result: any) => result

    return async (context: ScopedContainer, request: BunRequest) => {
      const controllerInstance = await context.get(controller)
      const argument = await formatArguments(request)
      const result =
        await controllerInstance[handlerMetadata.classMethod](argument)
      const headers: Record<string, string> = {}
      for (const [key, value] of Object.entries(handlerMetadata.headers)) {
        headers[key] = String(value)
      }
      return new Response(JSON.stringify(formatResponse(result)), {
        status: handlerMetadata.successStatusCode,
        headers: { 'Content-Type': 'application/json', ...headers },
      })
    }
  }
}
