// Message modules
export {
  MessageModule,
  getMessageModuleMetadata,
  hasMessageModuleMetadata,
} from './modules/index.mjs'
export type { MessageModuleMetadata } from './modules/index.mjs'

// Message controllers
export {
  MessageController,
  getMessageControllerMetadata,
  hasMessageControllerMetadata,
} from './controllers/index.mjs'
export type { MessageControllerMetadata } from './controllers/index.mjs'

// Message handlers
export { Message, getMessageHandlerMetadata } from './handlers/index.mjs'
export type { MessageHandlerMetadata, MessageParams, MessageResult } from './handlers/index.mjs'

// Guards
export type { MessageExecutionContext, MessageGuard } from './guards/index.mjs'

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
export type { MessageMetadata } from './attributes/index.mjs'

// Runtime
export { MessageHandlerService, MicroserviceFactory } from './runtime/index.mjs'
