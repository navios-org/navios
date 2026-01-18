import { inject, optional } from '@navios/di'

import type { BaseEndpointOptions } from '@navios/builder'
import type { ClassType, ScopedContainer } from '@navios/di'

import { NaviosOptionsToken } from '../tokens/index.mjs'

import type {
  ArgumentGetterFn,
  FormatArgumentsFn as InterfaceFormatArgumentsFn,
  HttpHeader,
} from '../interfaces/index.mjs'
import type { HandlerMetadata } from '../metadata/index.mjs'
import type { NaviosApplicationOptions } from '../navios.application.mjs'

import { InstanceResolverService, type InstanceResolution } from './instance-resolver.service.mjs'

// ============================================================================
// Types
// ============================================================================

/**
 * Function type for argument getters that extract data from requests.
 * Re-exported from interface for convenience in adapter implementations.
 */
export type ArgumentGetter<TRequest> = ArgumentGetterFn<TRequest>

/**
 * Internal alias for FormatArgumentsFn from interface.
 * Not re-exported to avoid duplicate exports - use FormatArgumentsFn from interfaces instead.
 */
type FormatArgumentsFn<TRequest> = InterfaceFormatArgumentsFn<TRequest>

/**
 * Static handler - can be called without a scoped container.
 */
export type AbstractStaticHandler<TRequest, TReply = void> = {
  isStatic: true
  handler: (request: TRequest, reply: TReply) => Promise<any>
}

/**
 * Dynamic handler - requires a scoped container for resolution.
 */
export type AbstractDynamicHandler<TRequest, TReply = void> = {
  isStatic: false
  handler: (scoped: ScopedContainer, request: TRequest, reply: TReply) => Promise<any>
}

/**
 * Handler result - either static or dynamic.
 */
export type AbstractHandlerResult<TRequest, TReply = void> =
  | AbstractStaticHandler<TRequest, TReply>
  | AbstractDynamicHandler<TRequest, TReply>

/**
 * Context passed to handler creation methods.
 */
export interface HandlerContext<TConfig extends BaseEndpointOptions = BaseEndpointOptions> {
  methodName: string
  statusCode: number
  headers: Partial<Record<HttpHeader, number | string | string[] | undefined>>
  handlerMetadata: HandlerMetadata<TConfig>
  hasArguments: boolean
}

// ============================================================================
// Default Options
// ============================================================================

const defaultOptions: NaviosApplicationOptions = {
  adapter: [],
  validateResponses: true,
  enableRequestId: false,
}

// ============================================================================
// Abstract Base Class
// ============================================================================

/**
 * Abstract base class for HTTP handler adapter services.
 *
 * Provides shared logic for:
 * - Controller resolution (singleton vs request-scoped)
 * - Argument formatting (sync/async detection)
 * - Handler generation with static/dynamic branching
 * - Standardized error handling
 *
 * Adapters implement abstract methods for framework-specific behavior:
 * - Request parsing (query, body, URL params)
 * - Response creation
 * - Schema provision
 *
 * Supports all adapter types:
 * - Endpoint adapters: JSON request/response with validation
 * - Stream adapters: Streaming responses with extra context
 * - Multipart adapters: Form data parsing (extends endpoint)
 *
 * @typeParam TRequest - Framework request type (BunRequest, FastifyRequest)
 * @typeParam TReply - Framework reply type (void for Bun, FastifyReply)
 * @typeParam TConfig - Endpoint configuration type
 */
export abstract class AbstractHandlerAdapterService<
  TRequest,
  TReply = void,
  TConfig extends BaseEndpointOptions = BaseEndpointOptions,
> {
  protected instanceResolver = inject(InstanceResolverService)
  protected options = optional(NaviosOptionsToken) ?? defaultOptions

  // ==========================================================================
  // Abstract Methods - Must be implemented by adapters
  // ==========================================================================

  /**
   * Creates argument getter functions for extracting data from requests.
   *
   * Each getter populates a target object with data from the request
   * (query params, body, URL params, etc.).
   *
   * Implementation varies by adapter type:
   * - Endpoint: JSON body parsing with schema validation
   * - Stream: Same as endpoint (body + query + url params)
   * - Multipart: FormData/multipart stream parsing
   *
   * @param handlerMetadata - Handler metadata with schemas and configuration
   * @returns Array of getter functions
   */
  protected abstract createArgumentGetters(
    handlerMetadata: HandlerMetadata<TConfig>,
  ): ArgumentGetter<TRequest>[]

  /**
   * Creates a static handler for singleton controllers.
   *
   * Implementation varies by adapter type:
   * - Endpoint: Invoke method(args), serialize response as JSON
   * - Stream: Invoke method(args, streamContext), return Response/use reply
   *
   * @param boundMethod - Pre-bound controller method
   * @param formatArguments - Function to format request arguments
   * @param context - Handler context with metadata
   * @returns Static handler result
   */
  protected abstract createStaticHandler(
    boundMethod: (...args: any[]) => Promise<any>,
    formatArguments: FormatArgumentsFn<TRequest>,
    context: HandlerContext<TConfig>,
  ): AbstractStaticHandler<TRequest, TReply>

  /**
   * Creates a dynamic handler for request-scoped controllers.
   *
   * Implementation varies by adapter type:
   * - Endpoint: Resolve controller per-request, invoke method(args)
   * - Stream: Resolve controller per-request, invoke method(args, streamContext)
   *
   * @param resolution - Instance resolution with resolve function
   * @param formatArguments - Function to format request arguments
   * @param context - Handler context with metadata
   * @returns Dynamic handler result
   */
  protected abstract createDynamicHandler(
    resolution: InstanceResolution,
    formatArguments: FormatArgumentsFn<TRequest>,
    context: HandlerContext<TConfig>,
  ): AbstractDynamicHandler<TRequest, TReply>

  // ==========================================================================
  // Public Interface Methods
  // ==========================================================================

  /**
   * Prepares argument getters for parsing request data.
   *
   * Public alias for createArgumentGetters to satisfy interface contracts.
   * Subclasses should override createArgumentGetters instead.
   *
   * @param handlerMetadata - Handler metadata with schemas and configuration
   * @returns Array of getter functions
   */
  prepareArguments(handlerMetadata: HandlerMetadata<TConfig>): ArgumentGetter<TRequest>[] {
    return this.createArgumentGetters(handlerMetadata)
  }

  /**
   * Checks if the handler has any validation schemas defined.
   *
   * Override in subclasses to add additional schema checks
   * (e.g., response schema validation for endpoint adapters).
   *
   * @param handlerMetadata - Handler metadata with configuration
   * @returns true if handler has schemas
   */
  hasSchema(handlerMetadata: HandlerMetadata<TConfig>): boolean {
    const config = handlerMetadata.config
    return !!config.requestSchema || !!config.querySchema
  }

  /**
   * Provides schema information for the framework's validation system.
   *
   * Override in subclasses for frameworks that support schema registration
   * (e.g., Fastify). Default returns empty object (suitable for Bun).
   *
   * @param handlerMetadata - Handler metadata with configuration
   * @returns Schema object for framework registration
   */
  provideSchema(_handlerMetadata: HandlerMetadata<TConfig>): Record<string, any> {
    return {}
  }

  /**
   * Creates a request handler function for the endpoint.
   *
   * This method orchestrates the entire handler creation:
   * 1. Prepares argument getters for request parsing
   * 2. Builds optimized formatArguments function (sync/async)
   * 3. Resolves the controller (singleton vs request-scoped)
   * 4. Creates appropriate handler (static or dynamic)
   *
   * @param controller - Controller class containing the handler method
   * @param handlerMetadata - Handler metadata with configuration
   * @returns Handler result (static or dynamic)
   */
  async provideHandler(
    controller: ClassType,
    handlerMetadata: HandlerMetadata<TConfig>,
  ): Promise<AbstractHandlerResult<TRequest, TReply>> {
    // Prepare argument getters
    const getters = this.createArgumentGetters(handlerMetadata)
    const formatArguments = this.buildFormatArguments(getters)
    const hasArguments = getters.length > 0

    // Build handler context
    const context: HandlerContext<TConfig> = {
      methodName: handlerMetadata.classMethod,
      statusCode: handlerMetadata.successStatusCode,
      headers: handlerMetadata.headers,
      handlerMetadata,
      hasArguments,
    }

    // Resolve controller with automatic scope detection
    const resolution = await this.instanceResolver.resolve(controller)

    // Create appropriate handler based on resolution
    if (resolution.cached) {
      const cachedController = resolution.instance as any
      const boundMethod = cachedController[context.methodName].bind(cachedController)
      return this.createStaticHandler(boundMethod, formatArguments, context)
    }

    return this.createDynamicHandler(resolution, formatArguments, context)
  }

  // ==========================================================================
  // Public Utilities
  // ==========================================================================

  /**
   * Builds a formatArguments function from argument getters.
   *
   * Automatically detects sync vs async getters and optimizes accordingly:
   * - If all getters are sync: returns sync function (no Promise overhead)
   * - If any getter is async: returns async function with Promise.all
   * - If no getters: returns frozen empty object (zero allocation)
   *
   * This method is public to allow composition-based adapters (like XML adapter)
   * to reuse the optimized formatArguments logic without inheritance.
   *
   * @param getters - Array of argument getter functions
   * @returns Function to format arguments from request
   */
  buildFormatArguments(getters: ArgumentGetter<TRequest>[]): FormatArgumentsFn<TRequest> {
    if (getters.length === 0) {
      const emptyArgs = Object.freeze({})
      return () => emptyArgs
    }

    // Detect if any getter is async at registration time
    const hasAsyncGetters = getters.some((g) => g.constructor.name === 'AsyncFunction')

    if (hasAsyncGetters) {
      return async (request: TRequest) => {
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
    }

    return (request: TRequest) => {
      const argument: Record<string, any> = {}
      for (const getter of getters) {
        getter(argument, request)
      }
      return argument
    }
  }

  // ==========================================================================
  // Protected Utilities
  // ==========================================================================

  /**
   * Checks if the URL pattern contains URL parameters.
   *
   * @param config - Endpoint configuration
   * @returns true if URL contains '$' parameter markers
   */
  protected hasUrlParams(config: TConfig): boolean {
    return config.url.includes('$')
  }

  /**
   * Wraps handler execution with standardized error handling.
   *
   * Re-throws HttpExceptions as-is for framework error handlers.
   * Other errors are re-thrown for global error handling.
   *
   * @param fn - Handler function to wrap
   * @returns Wrapped function with error handling
   */
  protected wrapWithErrorHandling<T extends (...args: any[]) => Promise<any>>(fn: T): T {
    return (async (...args: any[]) => {
      try {
        return await fn(...args)
      } catch (error) {
        // Re-throw HttpExceptions as-is for framework error handlers
        if (error && typeof error === 'object' && 'statusCode' in error) {
          throw error
        }
        // Re-throw unexpected errors for global error handling
        throw error
      }
    }) as T
  }
}
