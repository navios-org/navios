import type { ClassType, ScopedContainer } from '@navios/di'

import type { HandlerMetadata } from '../metadata/index.mjs'

/**
 * Static handler result - handler can be called without a scoped container.
 * Used when the controller and all its dependencies are singletons.
 */
export type StaticHandler<TRequest = any, TReply = any> = {
  isStatic: true
  handler: (request: TRequest, reply: TReply) => Promise<any>
}

/**
 * Dynamic handler result - handler requires a scoped container for resolution.
 * Used when the controller or its dependencies need per-request resolution.
 */
export type DynamicHandler<TRequest = any, TReply = any> = {
  isStatic: false
  handler: (
    scoped: ScopedContainer,
    request: TRequest,
    reply: TReply,
  ) => Promise<any>
}

/**
 * Handler result returned by provideHandler.
 * Can be either static (pre-resolved) or dynamic (needs scoped container).
 */
export type HandlerResult<TRequest = any, TReply = any> =
  | StaticHandler<TRequest, TReply>
  | DynamicHandler<TRequest, TReply>

/**
 * Function type for argument getters that extract data from requests.
 * Each getter populates a target object with data from the request.
 */
export type ArgumentGetterFn<TRequest = any> = (
  target: Record<string, any>,
  request: TRequest,
) => void | Promise<void>

/**
 * Function type for formatting arguments from a request.
 * Built from argument getters, optimized for sync/async handling.
 */
export type FormatArgumentsFn<TRequest = any> = (
  request: TRequest,
) => Record<string, any> | Promise<Record<string, any>>

/**
 * Interface for HTTP handler adapter services.
 *
 * Adapters handle different types of HTTP requests (REST, streaming, multipart)
 * and are responsible for:
 * - Parsing and validating request data
 * - Creating handler functions
 * - Formatting responses
 * - Providing schema information (for frameworks like Fastify)
 */
export interface AbstractHttpHandlerAdapterInterface<TRequest = any> {
  /**
   * Prepares argument getters for parsing request data.
   *
   * Creates functions that extract and validate data from the request,
   * populating a target object with validated arguments.
   *
   * @param handlerMetadata - The handler metadata with schemas and configuration.
   * @returns An array of getter functions that populate request arguments.
   */
  prepareArguments?: (
    handlerMetadata: HandlerMetadata<any>,
  ) => ArgumentGetterFn<TRequest>[]

  /**
   * Builds a formatArguments function from argument getters.
   *
   * Automatically detects sync vs async getters and optimizes accordingly:
   * - If all getters are sync: returns sync function (no Promise overhead)
   * - If any getter is async: returns async function with Promise.all
   * - If no getters: returns frozen empty object (zero allocation)
   *
   * This method is useful for composition-based adapters that need to
   * build formatArguments without duplicating the optimization logic.
   *
   * @param getters - Array of argument getter functions
   * @returns Function to format arguments from request
   */
  buildFormatArguments?: (
    getters: ArgumentGetterFn<TRequest>[],
  ) => FormatArgumentsFn<TRequest>

  /**
   * Checks if the handler has any validation schemas defined.
   *
   * @param handlerMetadata - The handler metadata containing configuration.
   * @returns `true` if the handler has any schemas (request, query, response).
   */
  hasSchema?: (handlerMetadata: HandlerMetadata<any>) => boolean

  /**
   * Provides schema information for the framework's validation system.
   *
   * For frameworks like Fastify, this returns route schema objects.
   * For frameworks like Bun, this typically returns an empty object.
   *
   * @param handlerMetadata - The handler metadata containing configuration.
   * @returns Schema information for framework registration.
   */
  provideSchema?: (handlerMetadata: HandlerMetadata<any>) => Record<string, any>

  /**
   * Creates a request handler function for the endpoint.
   *
   * This is the core method that generates the actual handler function
   * that will be called when a request matches the endpoint.
   *
   * @param controller - The controller class containing the handler method.
   * @param handlerMetadata - The handler metadata with configuration and schemas.
   * @returns A handler result that is either static or dynamic.
   */
  provideHandler: (
    controller: ClassType,
    handlerMetadata: HandlerMetadata<any>,
  ) => Promise<HandlerResult>
}
