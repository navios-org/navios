// Adds `messageControllers` to `@Module`.
import './module-options.mjs'

export { messageTransport } from './transport/message-transport.mjs'
export type {
  MessageHandlerInfo,
  MessageTransport,
  MessageTransportOptions,
} from './transport/message-transport.mjs'

export { MessageController } from './controllers/message-controller.mjs'
export type { MessageControllerOptions } from './controllers/message-controller.mjs'

export { Message } from './handlers/message.mjs'
export type { MessageParams, MessageResult } from './handlers/message-params.mjs'

export { isMessageContext, MessageContext } from './context/message-context.mjs'
export type { MessageGuard, MessageInterceptor } from './guards/message-guard.mjs'
export { MessageDeniedError, MessageValidationError } from './errors.mjs'
