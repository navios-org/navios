export { MessageController } from './decorators/message-controller.decorator.mjs'
export { Message } from './decorators/message.decorator.mjs'
export { MessageModule } from './decorators/message-module.decorator.mjs'
export type { MessageParams, MessageResult } from './types/message-params.mjs'
export type { MessageExecutionContext } from './interfaces/message-execution-context.mjs'
export { MessageHandlerService } from './services/message-handler.service.mjs'
export { MicroserviceFactory } from './services/microservice-factory.mjs'

// Attributes
export {
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
} from './attributes/index.mjs'

// Metadata helpers
export { hasMessageControllerMetadata } from './metadata/message-controller.metadata.mjs'
export { hasMessageModuleMetadata } from './metadata/message-module.metadata.mjs'
export { getMessageControllerMetadata } from './metadata/message-controller.metadata.mjs'
export { getMessageModuleMetadata } from './metadata/message-module.metadata.mjs'
export { getMessageHandlerMetadata } from './metadata/message-handler.metadata.mjs'
export type { MessageControllerMetadata } from './metadata/message-controller.metadata.mjs'
export type { MessageModuleMetadata } from './metadata/message-module.metadata.mjs'
export type { MessageHandlerMetadata } from './metadata/message-handler.metadata.mjs'

