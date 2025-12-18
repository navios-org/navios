/**
 * @navios/di - Dependency Injection Library
 *
 * This library provides a flexible dependency injection system with support for:
 * - Singleton and request-scoped services
 * - Factory-based and class-based service instantiation
 * - Circular dependency detection
 * - Schema validation for service arguments
 * - Lifecycle hooks (onServiceInit, onServiceDestroy)
 */

// ============================================================================
// PUBLIC API - Container
// ============================================================================

export { Container } from './container/container.mjs'
export { ScopedContainer } from './container/scoped-container.mjs'

// ============================================================================
// PUBLIC API - Tokens
// ============================================================================

export {
  InjectionToken,
  BoundInjectionToken,
  FactoryInjectionToken,
  type ClassType,
  type ClassTypeWithoutArguments,
  type ClassTypeWithArgument,
  type ClassTypeWithOptionalArgument,
  type ClassTypeWithInstance,
  type ClassTypeWithInstanceAndArgument,
  type ClassTypeWithInstanceAndOptionalArgument,
  type AnyInjectableType,
  type InjectionTokenType,
  type InjectionTokenSchemaType,
} from './token/injection-token.mjs'

export { Registry, globalRegistry, type FactoryRecord } from './token/registry.mjs'

// ============================================================================
// PUBLIC API - Decorators
// ============================================================================

export * from './decorators/index.mjs'

// ============================================================================
// PUBLIC API - Enums
// ============================================================================

export * from './enums/index.mjs'

// ============================================================================
// PUBLIC API - Interfaces
// ============================================================================

export * from './interfaces/index.mjs'

// ============================================================================
// PUBLIC API - Errors
// ============================================================================

export * from './errors/index.mjs'

// ============================================================================
// PUBLIC API - Utilities
// ============================================================================

export * from './utils/index.mjs'

// ============================================================================
// PUBLIC API - Symbols
// ============================================================================

export * from './symbols/index.mjs'

// ============================================================================
// PUBLIC API - Event Emitter
// ============================================================================

export { EventEmitter } from './event-emitter.mjs'

// ============================================================================
// PUBLIC API - Injectors
// ============================================================================

export {
  defaultInjectors,
  asyncInject,
  inject,
  optional,
  wrapSyncInit,
  provideFactoryContext,
} from './injectors.mjs'

// ============================================================================
// PUBLIC API - Testing
// ============================================================================

export * from './testing/index.mjs'

// ============================================================================
// INTERNAL API (exported for advanced use cases)
// ============================================================================

// Context types
export type { FactoryContext } from './internal/context/factory-context.mjs'
export {
  type RequestContext,
  type RequestContextHolder, // deprecated alias
  DefaultRequestContext,
  DefaultRequestContextHolder, // deprecated alias
  createRequestContext,
  createRequestContextHolder, // deprecated alias
} from './internal/context/request-context.mjs'
export {
  type ResolutionContextData,
  resolutionContext,
  withResolutionContext,
  getCurrentResolutionContext,
} from './internal/context/resolution-context.mjs'

// Holder types
export {
  InstanceStatus,
  ServiceLocatorInstanceHolderStatus, // deprecated alias
  type InstanceHolder,
  type ServiceLocatorInstanceHolder, // deprecated alias
  type InstanceEffect,
  type ServiceLocatorInstanceEffect, // deprecated alias
  type InstanceDestroyListener,
  type ServiceLocatorInstanceDestroyListener, // deprecated alias
  type InstanceHolderCreating,
  type ServiceLocatorInstanceHolderCreating, // deprecated alias
  type InstanceHolderCreated,
  type ServiceLocatorInstanceHolderCreated, // deprecated alias
  type InstanceHolderDestroying,
  type ServiceLocatorInstanceHolderDestroying, // deprecated alias
  type InstanceHolderError,
  type ServiceLocatorInstanceHolderError, // deprecated alias
} from './internal/holder/instance-holder.mjs'

export {
  BaseHolderManager,
  BaseInstanceHolderManager, // deprecated alias
  type HolderReadyResult,
} from './internal/holder/base-holder-manager.mjs'

export {
  HolderManager,
  ServiceLocatorManager, // deprecated alias
} from './internal/holder/holder-manager.mjs'

export {
  type HolderGetResult,
  type IHolderStorage,
} from './internal/holder/holder-storage.interface.mjs'

export {
  SingletonStorage,
  SingletonHolderStorage, // deprecated alias
} from './internal/holder/singleton-storage.mjs'

export {
  RequestStorage,
  RequestHolderStorage, // deprecated alias
} from './internal/holder/request-storage.mjs'

// Lifecycle
export {
  LifecycleEventBus,
  ServiceLocatorEventBus, // deprecated alias
} from './internal/lifecycle/lifecycle-event-bus.mjs'

export {
  CircularDetector,
  CircularDependencyDetector, // deprecated alias
} from './internal/lifecycle/circular-detector.mjs'

// Core engine
export { ServiceLocator } from './internal/core/service-locator.mjs'
export { InstanceResolver } from './internal/core/instance-resolver.mjs'
export {
  Instantiator,
  ServiceInstantiator, // deprecated alias
} from './internal/core/instantiator.mjs'
export { Invalidator } from './internal/core/invalidator.mjs'
export { TokenProcessor } from './internal/core/token-processor.mjs'
