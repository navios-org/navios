// Adds `messageControllers` to `@Module`.
import './module-options.mjs'

export { messageTransport } from './transport/message-transport.mjs'
export type {
  MessageHandlerInfo,
  MessageTransport,
  MessageTransportOptions,
} from './transport/message-transport.mjs'

export {
  getMessageControllerMetadata,
  hasMessageControllerMetadata,
  MessageController,
} from './controllers/index.mjs'
export type { MessageControllerMetadata, MessageControllerOptions } from './controllers/index.mjs'

export { Message } from './handlers/index.mjs'
export type { MessageParams, MessageResult } from './handlers/index.mjs'

export { isMessageContext, MessageContext } from './context/message-context.mjs'
export type { MessageGuard, MessageInterceptor } from './guards/index.mjs'
export { MessageDeniedError, MessageValidationError } from './errors.mjs'

// Attributes that describe how a handler wants its messages treated. They
// are stored on the handler and can be read with `AttributeFactory`; this
// package does not act on them yet.
export {
  Ack,
  BatchProcessing,
  Concurrency,
  DeadLetterQueue,
  ErrorHandling,
  Idempotency,
  ManualAck,
  NoAck,
  Priority,
  RateLimit,
  Retry,
  Timeout,
} from './attributes/index.mjs'
