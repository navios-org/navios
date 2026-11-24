// Socket builder
export { socketBuilder } from './socket-builder.mjs'

// Types
export * from './types/index.mjs'

// Handlers (for advanced use)
export { createSendHandler, defaultFormatMessage } from './handlers/create-send.mjs'
export {
  createSubscribeHandler,
  createGlobalMessageHandler,
  defaultParseMessage,
} from './handlers/create-subscribe.mjs'

// Errors
export { SocketError, isSocketError } from '../errors/socket-error.mjs'
export type { SocketErrorInit, SocketErrorKind } from '../errors/socket-error.mjs'

// WebSocket wrapper
export * from './websocket/index.mjs'
