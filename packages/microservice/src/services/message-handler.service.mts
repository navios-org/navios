import type { ClassType, Container, ScopedContainer } from '@navios/di'

import { inject, Injectable } from '@navios/di'
import { AttributeFactory } from '@navios/core'

import type { QueueClient } from '@navios/queues'
import { QueueClientToken } from '@navios/queues'

import type { MessageExecutionContext } from '../interfaces/message-execution-context.mjs'
import type {
  MessageControllerMetadata,
  MessageHandlerMetadata,
  MessageModuleMetadata,
} from '../metadata/index.mjs'
import {
  extractMessageControllerMetadata,
  extractMessageModuleMetadata,
} from '../metadata/index.mjs'
import {
  Ack,
  NoAck,
  ManualAck,
  Retry,
  DeadLetterQueue,
  Concurrency,
  Timeout,
  ErrorHandling,
  Idempotency,
  RateLimit,
  BatchProcessing,
  Priority,
} from '../attributes/index.mjs'

/**
 * Service that handles message processing, including:
 * - Discovering message controllers and handlers
 * - Subscribing to queues/topics
 * - Validating messages
 * - Executing guards
 * - Processing attributes
 * - Calling handler methods
 */
@Injectable()
export class MessageHandlerService {
  private queueClient = inject(QueueClientToken)

  /**
   * Discovers and registers message handlers from modules.
   *
   * @param rootModule - Root message module class
   * @param container - Dependency injection container
   */
  async discoverHandlers(
    rootModule: ClassType,
    container: ScopedContainer | Container,
  ): Promise<void> {
    // TODO: Implement handler discovery
    // - Extract module metadata
    // - Recursively process imports
    // - Extract controller metadata
    // - Extract handler metadata
    // - Subscribe to queues/topics based on message definitions
    throw new Error('Message handler discovery not yet implemented')
  }

  /**
   * Processes a message by:
   * 1. Reading attributes from handler, controller, and module
   * 2. Validating message payload
   * 3. Executing guards
   * 4. Processing attributes (Ack, Retry, etc.)
   * 5. Calling handler method
   * 6. Handling acknowledgment
   *
   * @param handlerMetadata - Handler metadata
   * @param controllerMetadata - Controller metadata
   * @param moduleMetadata - Module metadata
   * @param payload - Message payload
   * @param rawMessage - Raw message object from queue
   * @param container - Scoped container for handler execution
   */
  async processMessage(
    handlerMetadata: MessageHandlerMetadata,
    controllerMetadata: MessageControllerMetadata,
    moduleMetadata: MessageModuleMetadata,
    payload: unknown,
    rawMessage: unknown,
    container: ScopedContainer,
  ): Promise<void> {
    // TODO: Implement message processing
    // 1. Read attributes using AttributeFactory.getLast()
    // 2. Validate payload against schema
    // 3. Execute guards
    // 4. Process Ack/NoAck/ManualAck attributes
    // 5. Process Retry attribute
    // 6. Process DeadLetterQueue attribute
    // 7. Process Concurrency attribute
    // 8. Process Timeout attribute
    // 9. Process ErrorHandling attribute
    // 10. Process Idempotency attribute
    // 11. Process RateLimit attribute
    // 12. Process BatchProcessing attribute
    // 13. Process Priority attribute
    // 14. Call handler method
    // 15. Handle acknowledgment based on attributes
    throw new Error('Message processing not yet implemented')
  }

  /**
   * Creates a message execution context for guards and handlers.
   */
  private createExecutionContext(
    handlerMetadata: MessageHandlerMetadata,
    controllerMetadata: MessageControllerMetadata,
    moduleMetadata: MessageModuleMetadata,
    payload: unknown,
    rawMessage: unknown,
  ): MessageExecutionContext {
    return {
      getModule: () => moduleMetadata,
      getController: () => controllerMetadata,
      getHandler: () => handlerMetadata,
      getPayload: () => payload,
      getRawMessage: () => rawMessage,
    }
  }
}

