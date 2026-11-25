import type { MessageControllerMetadata } from '../controllers/message-controller-metadata.mjs'
import type { MessageHandlerMetadata } from '../handlers/message-handler-metadata.mjs'
import type { MessageModuleMetadata } from '../modules/message-module-metadata.mjs'

/**
 * Execution context for message handlers.
 * Provides access to message metadata, payload, and guards.
 * Similar to AbstractExecutionContext but for messages.
 */
export interface MessageExecutionContext {
  /**
   * Gets the message module metadata.
   */
  getModule(): MessageModuleMetadata

  /**
   * Gets the message controller metadata.
   */
  getController(): MessageControllerMetadata

  /**
   * Gets the message handler metadata.
   */
  getHandler(): MessageHandlerMetadata

  /**
   * Gets the message payload.
   */
  getPayload(): unknown

  /**
   * Gets the raw message object (queue-specific).
   */
  getRawMessage(): unknown
}
