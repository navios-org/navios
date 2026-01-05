import type {
  BoundInjectionToken,
  InjectionToken,
} from '../token/injection-token.mjs'
import type { Registry } from '../token/registry.mjs'

/**
 * Tracks method calls on a mocked service.
 */
export interface MethodCallRecord {
  method: string
  args: unknown[]
  timestamp: number
  result?: unknown
  error?: Error
}

/**
 * Tracks lifecycle events for a service.
 */
export interface LifecycleRecord {
  event: 'created' | 'initialized' | 'destroyed'
  timestamp: number
  instanceName: string
}

/**
 * Statistics about a mocked service.
 */
export interface MockServiceStats {
  instanceCount: number
  methodCalls: MethodCallRecord[]
  lifecycleEvents: LifecycleRecord[]
}

/**
 * A node in the dependency graph.
 */
export interface DependencyNode {
  token: string
  instanceName: string
  scope: string
  dependencies: string[]
  dependents: string[]
}

/**
 * Serializable dependency graph for snapshot testing.
 */
export interface DependencyGraph {
  nodes: Record<string, DependencyNode>
  rootTokens: string[]
}

/**
 * Binding configuration for TestContainer.
 */
export interface BindingBuilder<T> {
  /**
   * Bind to a concrete value.
   */
  toValue(value: T): void

  /**
   * Bind to a class implementation.
   */
  toClass<C extends new (...args: any[]) => T>(cls: C): void

  /**
   * Bind to a factory function.
   */
  toFactory(factory: () => T | Promise<T>): void
}

/**
 * Provider configuration for UnitTestContainer.
 */
export interface ProviderConfig<T = any> {
  token:
    | InjectionToken<T, any>
    | BoundInjectionToken<T, any>
    | (new (...args: any[]) => T)
  useValue?: T
  useClass?: new (...args: any[]) => T
  useFactory?: () => T | Promise<T>
}

/**
 * Options for TestContainer.
 */
export interface TestContainerOptions {
  /**
   * Parent registry. Defaults to globalRegistry.
   * Pass `null` to create a completely isolated container.
   */
  parentRegistry?: Registry | null

  /**
   * Logger for debugging.
   */
  logger?: Console | null
}

/**
 * Options for UnitTestContainer.
 */
export interface UnitTestContainerOptions {
  /**
   * List of providers to register. Only these services can be resolved.
   */
  providers: ProviderConfig[]

  /**
   * If true, unregistered dependencies will be auto-mocked instead of throwing.
   * Default: false (throws on unregistered dependencies)
   */
  allowUnregistered?: boolean

  /**
   * Logger for debugging.
   */
  logger?: Console | null
}
