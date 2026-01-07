import type { EndpointOptions } from '@navios/builder'
import type {
  ClassType,
  HandlerMetadata,
  NaviosApplicationOptions,
  ScopedContainer,
} from '@navios/core'
import type { BunRequest } from 'bun'

import {
  Injectable,
  InjectionToken,
  NaviosOptionsToken,
  optional,
} from '@navios/core'

import type { BunHandlerResult } from './handler-adapter.interface.mjs'

import { BunStreamAdapterService } from './stream-adapter.service.mjs'

const defaultOptions: NaviosApplicationOptions = {
  adapter: [],
  validateResponses: true,
  enableRequestId: false,
}

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
  private options = optional(NaviosOptionsToken) ?? defaultOptions

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
   * Provides schema information for the handler.
   *
   * For Bun adapter, this returns an empty object as Bun doesn't require
   * schema registration like some other frameworks.
   *
   * @param handlerMetadata - The handler metadata containing configuration.
   * @returns An empty schema object.
   */
  override provideSchema(
    handlerMetadata: HandlerMetadata<EndpointOptions>,
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
  override async provideHandler(
    controller: ClassType,
    handlerMetadata: HandlerMetadata<EndpointOptions>,
  ): Promise<BunHandlerResult> {
    const getters = this.prepareArguments(handlerMetadata)
    const hasArguments = getters.length > 0

    const responseSchema = handlerMetadata.config.responseSchema
    const shouldValidate = this.options.validateResponses !== false
    const formatResponse =
      responseSchema && shouldValidate
        ? (result: any) => responseSchema.parse(result)
        : (result: any) => result

    // Cache method name for faster property access
    const methodName = handlerMetadata.classMethod

    // Pre-compute headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    for (const [key, value] of Object.entries(handlerMetadata.headers)) {
      headers[key] = String(value)
    }

    // Resolve controller with automatic scope detection
    const resolution = await this.instanceResolver.resolve(controller)

    // Pre-compute status code
    const statusCode = handlerMetadata.successStatusCode

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
            const result = await boundMethod(argument)
            return new Response(JSON.stringify(formatResponse(result)), {
              status: statusCode,
              headers,
            })
          },
        }
      }

      return {
        isStatic: false,
        handler: async (scoped: ScopedContainer, request: BunRequest) => {
          const controllerInstance = (await resolution.resolve(scoped)) as any
          const argument = await formatArguments(request)
          const result = await controllerInstance[methodName](argument)
          return new Response(JSON.stringify(formatResponse(result)), {
            status: statusCode,
            headers,
          })
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
          const result = await boundMethod(emptyArgs)
          return new Response(JSON.stringify(formatResponse(result)), {
            status: statusCode,
            headers,
          })
        },
      }
    }

    return {
      isStatic: false,
      handler: async (scoped: ScopedContainer, _request: BunRequest) => {
        const controllerInstance = (await resolution.resolve(scoped)) as any
        const result = await controllerInstance[methodName](emptyArgs)
        return new Response(JSON.stringify(formatResponse(result)), {
          status: statusCode,
          headers,
        })
      },
    }
  }
}
