// Socket builder
export { socketBuilder } from './socket-builder.mjs'
export type {
  ProvideSocketClientOptions,
  SocketBuilderInstance,
} from './socket-builder-instance.mjs'
export type {
  MessageFormatter,
  MessageParser,
  SendOptions,
  SocketBuilderConfig,
  SocketTopicTransport,
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
export type { SocketClient } from './socket-client.mjs'

// Errors
export { SocketError, isSocketError } from './socket-error.mjs'
export type { SocketErrorInit, SocketErrorKind } from './socket-error.mjs'

// WebSocket wrapper
export { createWebSocketHandler, declareWebSocket } from './declare-websocket.mjs'
export type {
  CreateWebSocketHandlerConfig,
  DeclareWebSocketOptions,
  InferWebSocketConnectParams,
  WebSocketConstructor,
  WebSocketLike,
} from './declare-websocket-options.mjs'
export type {
  WebSocketHandler,
  WebSocketHandleState,
  WebSocketSocketHandle,
} from './websocket-handle.mjs'
