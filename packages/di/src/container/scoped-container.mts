import { InjectableScope } from '../enums/index.mjs'
import { UnifiedStorage } from '../internal/holder/unified-storage.mjs'
import { BoundToken, Token } from '../token/token.mjs'

import type { ContainerInternals } from '../interfaces/container.interface.mjs'
import type { Factorable } from '../interfaces/factory.interface.mjs'
import type {
  ClassType,
  ClassTypeWithArgument,
  FactoryToken,
  TokenSchemaType,
} from '../token/token.mjs'
import type { StandardSchemaV1 } from '../token/schema.mjs'
import type { Registry } from '../token/registry.mjs'
import type { TokenArgsRequiredError } from '../utils/types.mjs'

import { AbstractContainer } from './abstract-container.mjs'
import { Container } from './container.mjs'

/**
 * Request-scoped dependency injection container.
 *
 * Wraps a parent Container and provides isolated request-scoped instances
 * while delegating singleton and transient resolution to the parent.
 * This design eliminates race conditions that can occur with async operations
 * when multiple requests are processed concurrently.
 */
export class ScopedContainer extends AbstractContainer {
  protected readonly defaultScope = InjectableScope.Request

  private readonly storage: UnifiedStorage
  private disposed = false
  private readonly metadata: Record<string, any>

  /**
   * @internal
   * Internal component namespace. Escape hatch for plugin authors and
   * internal wiring — NOT stable public API. Frozen at construction.
   *
   * The ScopedContainer owns only its request-scoped {@link storage}; every
   * other component (resolver, registry, token/name resolvers, invalidator,
   * initializer, event bus, plugin registry) is delegated to the parent
   * {@link Container}'s frozen `internals` so a scope shares its parent's
   * wiring rather than duplicating it.
   */
  readonly internals: ContainerInternals

  constructor(
    private readonly parent: Container,
    private readonly registry: Registry,
    public readonly requestId: string,
    metadata?: Record<string, any>,
  ) {
    super()
    // Create own unified storage for request-scoped services
    this.storage = new UnifiedStorage(InjectableScope.Request)
    this.metadata = metadata || {}
    const parentInternals = this.parent.internals
    this.internals = Object.freeze({
      registry: this.registry,
      storage: this.storage,
      eventBus: parentInternals.eventBus,
      resolver: parentInternals.resolver,
      serviceInitializer: parentInternals.serviceInitializer,
      serviceInvalidator: parentInternals.serviceInvalidator,
      tokenResolver: parentInternals.tokenResolver,
      nameResolver: parentInternals.nameResolver,
      pluginRegistry: parentInternals.pluginRegistry,
    })
  }

  // ============================================================================
  // SCOPED CONTAINER SPECIFIC METHODS
  // ============================================================================

  /**
   * Gets the request ID for this scoped container.
   */
  getRequestId(): string {
    return this.requestId
  }

  /**
   * Gets the parent container.
   */
  getParent(): Container {
    return this.parent
  }

  /**
   * Gets metadata from the request context.
   */
  getMetadata(key: string): any | undefined {
    return this.metadata[key]
  }

  /**
   * Sets metadata on the request context.
   */
  setMetadata(key: string, value: any): void {
    this.metadata[key] = value
  }

  /**
   * Gets an instance from the container.
   * Request-scoped services are resolved from this container's storage.
   * All other services are delegated to the parent container.
   */
  // #1 Simple class
  get<T extends ClassType>(
    token: T,
  ): InstanceType<T> extends Factorable<infer R> ? Promise<R> : Promise<InstanceType<T>>
  // #1.1 Simple class with args
  get<T extends ClassTypeWithArgument<R>, R>(token: T, args: R): Promise<InstanceType<T>>
  // #2 Token with required Schema
  get<T, S extends TokenSchemaType>(
    token: Token<T, S>,
    args: StandardSchemaV1.InferInput<S>,
  ): Promise<T>
  // #3 Token with schema resolved without args -> compile-time DX error
  get<T, S extends TokenSchemaType, R extends boolean>(
    token: Token<T, S, R>,
  ): R extends false ? Promise<T> : TokenArgsRequiredError<S>
  // #4 Token with no Schema
  get<T>(token: Token<T, undefined>): Promise<T>
  get<T>(token: BoundToken<T, any>): Promise<T>
  get<T>(token: FactoryToken<T, any>): Promise<T>

  async get(
    token:
      | ClassType
      | Token<any>
      | BoundToken<any, any>
      | FactoryToken<any, any>,
    args?: unknown,
  ) {
    if (this.disposed) {
      throw new Error('ScopedContainer has been disposed')
    }

    // Check if this is a request-scoped service
    const tokenResolver = this.internals.tokenResolver
    const realToken = tokenResolver.getRegistryToken(token)

    if (this.registry.has(realToken)) {
      const record = this.registry.get(realToken)
      if (record.scope === InjectableScope.Request) {
        // Resolve request-scoped service from this container
        const [error, instance] = await this.internals.resolver.resolveRequestScopedInstance(
          token,
          args,
          this,
        )

        if (error) {
          throw error
        }

        return instance
      }
    }

    // Delegate singleton/transient services to parent
    const [error, instance] = await this.internals.resolver.resolveInstance(
      token,
      args,
      this,
      this.storage,
      this.requestId,
    )

    if (error) {
      throw error
    }

    return instance
  }

  /**
   * Explicitly resolves `token` treating its effective host scope as
   * {@link InjectableScope.Request} for THIS resolution only, within this
   * ScopedContainer's request scope.
   *
   * This is the deliberate, opt-in, non-mutating, race-free successor to the
   * v1 implicit Singleton -> Request scope-upgrade that v2 deleted:
   *
   * - The resolved instance is created and cached in THIS ScopedContainer's
   *   OWN request storage, keyed for this request — exactly like a normally
   *   Request-scoped service — and disposed at {@link endRequest}. It is
   *   never written to the parent/global singleton storage.
   * - Zero global mutation: the token's registered scope and every shared
   *   registration are UNCHANGED. Any other code resolving the same token
   *   via `container.get()` / `scoped.get()` is completely unaffected and
   *   keeps its declared-scope behavior (a Singleton stays a process
   *   singleton elsewhere).
   * - The fail-fast scope-validator passes by construction (the host is
   *   genuinely resolved with effective scope = Request), without any
   *   bypass flag and without poisoning the validator's per-class memo: the
   *   normal `get()` Singleton fail-fast for the same class still throws.
   * - Idempotent within a request (two calls return the same instance);
   *   isolated across requests; transitive deps keep their declared scope.
   *
   * Use this when a controller-like class is declared Singleton but must be
   * resolved per-request (e.g. it eagerly depends on Request-scoped state).
   */
  // #1 Simple class
  resolveInScope<T extends ClassType>(
    token: T,
  ): InstanceType<T> extends Factorable<infer R> ? Promise<R> : Promise<InstanceType<T>>
  // #1.1 Simple class with args
  resolveInScope<T extends ClassTypeWithArgument<R>, R>(
    token: T,
    args: R,
  ): Promise<InstanceType<T>>
  // #2 Token with required Schema
  resolveInScope<T, S extends TokenSchemaType>(
    token: Token<T, S>,
    args: StandardSchemaV1.InferInput<S>,
  ): Promise<T>
  // #3 Token with schema resolved without args -> compile-time DX error
  resolveInScope<T, S extends TokenSchemaType, R extends boolean>(
    token: Token<T, S, R>,
  ): R extends false ? Promise<T> : TokenArgsRequiredError<S>
  // #4 Token with no Schema
  resolveInScope<T>(token: Token<T, undefined>): Promise<T>
  resolveInScope<T>(token: BoundToken<T, any>): Promise<T>
  resolveInScope<T>(token: FactoryToken<T, any>): Promise<T>

  async resolveInScope(
    token:
      | ClassType
      | Token<any>
      | BoundToken<any, any>
      | FactoryToken<any, any>,
    args?: unknown,
  ) {
    if (this.disposed) {
      throw new Error('ScopedContainer has been disposed')
    }

    const [error, instance] = await this.internals.resolver.resolveInScopeInstance(
      token,
      args,
      this,
    )

    if (error) {
      throw error
    }

    return instance
  }

  /**
   * Invalidates a service and its dependencies.
   */
  async invalidate(service: unknown): Promise<void> {
    // Find the service by instance in request storage
    const holder = this.storage.findByInstance(service)
    if (!holder) {
      // Try parent storage
      return this.parent.invalidate(service)
    }

    await this.internals.serviceInvalidator.invalidateWithStorage(holder.name, this.storage, {
      destroyContext: { container: this, requestId: this.requestId },
    })
  }

  /**
   * Disposes the container and cleans up all resources.
   * Alias for endRequest().
   */
  async dispose(): Promise<void> {
    return this.endRequest()
  }

  /**
   * @internal
   * Attempts to get an instance synchronously if it already exists.
   * Checks request storage first, then delegates to parent.
   */
  override tryGetSync<T>(token: any, args?: any): T | null {
    // Check request storage first for request-scoped services.
    // Token resolution can throw for an unregistered / non-@Injectable
    // token; treat that as "not request-scoped" and delegate to the parent
    // (which is sound and returns null) so tryGetSync never throws.
    const tokenResolver = this.internals.tokenResolver
    let scope: InjectableScope = InjectableScope.Singleton
    try {
      const realToken = tokenResolver.getRegistryToken(token)
      scope = this.registry.has(realToken)
        ? this.registry.get(realToken).scope
        : InjectableScope.Singleton
    } catch {
      // Ignore error — fall through to parent delegation.
    }

    if (scope === InjectableScope.Request) {
      const result = this.tryGetSyncFromStorage<T>(token, args, this.storage, this.requestId)
      if (result !== null) {
        return result
      }
    }

    // Delegate to parent for singleton/transient
    return this.parent.tryGetSync<T>(token, args, this.requestId)
  }

  /**
   * Adds an instance to the container.
   * Overrides base class to check disposed state.
   */
  override addInstance<T>(
    token: ClassType | Token<T, any> | BoundToken<T, any>,
    instance: T,
  ): void {
    if (this.disposed) {
      throw new Error('ScopedContainer has been disposed')
    }

    super.addInstance(token, instance)
  }

  /**
   * Ends the request and cleans up all request-scoped services.
   */
  async endRequest(): Promise<void> {
    if (this.disposed) {
      return
    }

    this.disposed = true

    // Clear all request-scoped services
    await this.internals.serviceInvalidator.clearAllWithStorage(this.storage, {
      destroyContext: { container: this, requestId: this.requestId },
    })

    // Remove request ID from parent
    this.parent.removeRequestId(this.requestId)
  }
}
