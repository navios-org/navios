import type {
  AbstractHttpHandlerAdapterInterface,
  ClassType,
  HandlerMetadata,
  ScopedContainer,
} from '@navios/core'
import type { BunRequest } from 'bun'

/**
 * Interface for Bun handler adapter services.
 *
 * This interface defines the contract for adapter services that handle
 * different types of HTTP requests in Bun. Adapters are responsible for:
 * - Parsing and validating request data
 * - Creating handler functions
 * - Formatting responses
 * - Providing schema information (if needed)
 *
 * Different adapter implementations handle different endpoint types:
 * - `BunEndpointAdapterService`: Standard REST endpoints
 * - `BunStreamAdapterService`: Streaming endpoints
 * - `BunMultipartAdapterService`: File upload and multipart endpoints
 *
 * @extends {AbstractHttpHandlerAdapterInterface}
 */
export interface BunHandlerAdapterInterface extends AbstractHttpHandlerAdapterInterface {
  /**
   * Provides schema information for the handler (optional).
   *
   * For Bun adapter, this typically returns an empty object as Bun doesn't
   * require schema registration like some other frameworks.
   *
   * @param handlerMetadata - The handler metadata containing configuration.
   * @returns Schema information (usually empty for Bun).
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
    request: BunRequest,
  ) => Promise<void> | void)[]

  /**
   * Creates a request handler function for the endpoint.
   *
   * This is the core method that generates the actual handler function
   * that will be called when a request matches the endpoint.
   *
   * @param controller - The controller class containing the handler method.
   * @param handlerMetadata - The handler metadata with configuration and schemas.
   * @returns A function that handles incoming requests and returns responses.
   */
  provideHandler: (
    controller: ClassType,
    handlerMetadata: HandlerMetadata<any>,
  ) => (context: ScopedContainer, request: BunRequest) => Promise<Response>
}
