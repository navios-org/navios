import type {
  AbstractHttpHandlerAdapterInterface,
  ClassType,
  HandlerMetadata,
  ScopedContainer,
} from '@navios/core'
import type { FastifyReply, FastifyRequest } from 'fastify'

/**
 * Interface for Fastify handler adapter services.
 *
 * This interface defines the contract for adapter services that handle
 * different types of HTTP requests in Fastify. Adapters are responsible for:
 * - Parsing and validating request data
 * - Creating handler functions
 * - Formatting responses
 * - Providing schema information for Fastify's validation system
 *
 * Different adapter implementations handle different endpoint types:
 * - `FastifyEndpointAdapterService`: Standard REST endpoints
 * - `FastifyStreamAdapterService`: Streaming endpoints
 * - `FastifyMultipartAdapterService`: File upload and multipart endpoints
 *
 * @extends {AbstractHttpHandlerAdapterInterface}
 */
export interface FastifyHandlerAdapterInterface extends AbstractHttpHandlerAdapterInterface {
  /**
   * Provides Fastify schema information for the handler (optional).
   *
   * Creates a Fastify route schema object that enables built-in validation
   * and serialization. The schema typically includes `body`, `querystring`,
   * and `response` properties.
   *
   * @param handlerMetadata - The handler metadata containing configuration and schemas.
   * @returns Fastify route schema object.
   */
  provideSchema?: (handlerMetadata: HandlerMetadata<any>) => Record<string, any>

  /**
   * Checks if the handler has any validation schemas defined (optional).
   *
   * @param handlerMetadata - The handler metadata containing configuration.
   * @returns `true` if the handler has any schemas (request, query, response).
   */
  hasSchema?: (handlerMetadata: HandlerMetadata<any>) => boolean

  /**
   * Prepares argument getters for parsing request data (optional).
   *
   * Creates functions that extract and validate data from the request,
   * populating a target object with validated arguments.
   *
   * @param handlerMetadata - The handler metadata with schemas and configuration.
   * @returns An array of getter functions that populate request arguments.
   */
  prepareArguments?: (
    handlerMetadata: HandlerMetadata<any>,
  ) => ((
    target: Record<string, any>,
    request: FastifyRequest,
  ) => Promise<void> | void)[]

  /**
   * Creates a request handler function for the endpoint.
   *
   * This is the core method that generates the actual handler function
   * that will be called when a request matches the endpoint. The handler
   * receives the request and reply objects for full control over the
   * request/response lifecycle.
   *
   * @param controller - The controller class containing the handler method.
   * @param handlerMetadata - The handler metadata with configuration and schemas.
   * @returns A function that handles incoming requests and sends responses.
   */
  provideHandler: (
    controller: ClassType,
    handlerMetadata: HandlerMetadata<any>,
  ) => (
    context: ScopedContainer,
    request: FastifyRequest,
    reply: FastifyReply,
  ) => Promise<any>
}
