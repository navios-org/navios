import type {
  MessageControllerMetadata,
  MessageHandlerMetadata,
  MessageModuleMetadata,
} from '../metadata/index.mjs'

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

