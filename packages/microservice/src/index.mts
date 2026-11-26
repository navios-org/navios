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
