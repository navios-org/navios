/**
 * What the author of a transport needs and application code does not: the
 * transport contract, the module graph, handler metadata, and the pieces of
 * an execution context.
 *
 * Application code imports from `@navios/core`.
 */
import './internal/this-copy.mjs'

// The contract. The types it shares with application code, such as
// `Transport`, `HandlerInfo` and `Guard`, are exported by `@navios/core`.
export { defineTransport } from './transports/transport.mjs'
export type { TransportDefinition, TransportHost } from './transports/transport.mjs'

// Waiting, but not for ever.
export { MAX_DELAY_MS, settledWithin } from './transports/settled-within.mjs'

// Modules.
export { buildModuleGraph, moduleClasses } from './modules/module-graph.mjs'
export type { ModuleNode } from './modules/module-graph.mjs'
export { getModuleMetadata } from './modules/module-metadata.mjs'
export type { ModuleMetadata } from './modules/module-metadata.mjs'

// Handlers: what decorators attached to them, and what runs around them.
export { describeHandlerClass } from './metadata/handler-class.mjs'
export type { HandlerClassMetadata, HandlerClassOptions } from './metadata/handler-class.mjs'
export { memberMetadata } from './metadata/member-metadata.mjs'
export type { HandlerExtras, MethodHandlerMetadata } from './metadata/member-metadata.mjs'
export { ownMetadata, requireMetadata } from './metadata/decorator-metadata.mjs'
export type { DecoratorMetadata } from './metadata/decorator-metadata.mjs'
export { classMetadata } from './metadata/class-store.mjs'
export type { ClassMetadata } from './metadata/class-store.mjs'
export { handlerChain } from './metadata/handler-chain.mjs'
export type { HandlerChain, HandlerChainInput } from './metadata/handler-chain.mjs'
export { executeChain, resolveChain, runChain } from './metadata/run-chain.mjs'
export type { ResolvedChain } from './metadata/run-chain.mjs'

// Execution contexts.
export { BasicExecutionContext } from './execution/basic-execution-context.mjs'
export type { BasicExecutionContextInit } from './execution/basic-execution-context.mjs'
export { runInContext } from './execution/async-context.mjs'
export { needsScope } from './execution/context-host.mjs'
export type { ContextHost } from './execution/context-host.mjs'
