// EventSource builder
export { eventSourceBuilder } from './eventsource-builder.mjs'
export type {
  EventSourceBuilderInstance,
  ProvideEventSourceClientOptions,
} from './eventsource-builder-instance.mjs'
export type { EventOptions, EventSourceBuilderConfig } from './eventsource-options.mjs'
export type { EventHandler, EventUnsubscribe, InferEventPayload } from './eventsource-handlers.mjs'

// Client contract
export { isEventSourceClient } from './eventsource-client.mjs'
export type { EventSourceClient } from './eventsource-client.mjs'

// Errors
export { EventSourceError, isEventSourceError } from './eventsource-error.mjs'
export type { EventSourceErrorInit, EventSourceErrorKind } from './eventsource-error.mjs'

// EventSource wrapper
export { createEventSourceHandler, declareEventSource } from './declare-eventsource.mjs'
export type {
  CreateEventSourceHandlerConfig,
  DeclareEventSourceOptions,
  EventSourceConstructor,
  EventSourceLike,
  InferEventSourceConnectParams,
} from './declare-eventsource-options.mjs'
export type {
  EventSourceHandle,
  EventSourceHandler,
  EventSourceHandleState,
} from './eventsource-handle.mjs'
