// Socket builder
export { socketBuilder } from './socket-builder.mjs'
export type { SocketBuilderInstance } from './socket-builder-instance.mjs'
export type {
  MessageFormatter,
  MessageParser,
  SendOptions,
  SocketBuilderConfig,
  SubscribeOptions,
} from './socket-options.mjs'
export type {
  InferSendPayload,
  InferSendReturn,
  InferSubscribePayload,
  SendHandler,
  SubscribeHandler,
  Unsubscribe,
} from './socket-handlers.mjs'

// Client contract
export { isSocketClient } from './socket-client.mjs'
export type { SocketClient } from './socket-client.mjs'

// Handlers (for advanced use)
export { createSendHandler, defaultFormatMessage } from './create-send.mjs'
export {
  createSubscribeHandler,
  createGlobalMessageHandler,
  defaultParseMessage,
} from './create-subscribe.mjs'

// Errors
export { SocketError, isSocketError } from './socket-error.mjs'
export type { SocketErrorInit, SocketErrorKind } from './socket-error.mjs'

// WebSocket wrapper
export { createWebSocketHandler, declareWebSocket } from './declare-websocket.mjs'
export type {
  CreateWebSocketHandlerConfig,
  DeclareWebSocketOptions,
  InferWebSocketConnectParams,
} from './declare-websocket-options.mjs'
export type {
  WebSocketHandler,
  WebSocketHandleState,
  WebSocketSocketHandle,
} from './websocket-handle.mjs'
