/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-empty-object-type */
import type { z, ZodObject, ZodOptional } from 'zod/v4'

import type { FactoryContext } from './factory-context.mjs'
import type {
  AnyInjectableType,
  BaseInjectionTokenSchemaType,
  InjectionTokenSchemaType,
  InjectionTokenType,
  OptionalInjectionTokenSchemaType,
} from './injection-token.mjs'
import type { Registry } from './registry.mjs'
import type { RequestContextHolder } from './request-context-holder.mjs'
import type { ServiceLocatorInstanceHolder } from './service-locator-instance-holder.mjs'
import type { Injectors } from './utils/index.mjs'

import { InjectableScope } from './enums/index.mjs'
import {
  ErrorsEnum,
  FactoryNotFound,
  FactoryTokenNotResolved,
  UnknownError,
} from './errors/index.mjs'
import {
  BoundInjectionToken,
  FactoryInjectionToken,
  InjectionToken,
} from './injection-token.mjs'
import { defaultInjectors } from './injector.mjs'
import { globalRegistry } from './registry.mjs'
import { DefaultRequestContextHolder } from './request-context-holder.mjs'
import { ServiceInstantiator } from './service-instantiator.mjs'
import { ServiceLocatorEventBus } from './service-locator-event-bus.mjs'
import { ServiceLocatorInstanceHolderStatus } from './service-locator-instance-holder.mjs'
import { ServiceLocatorManager } from './service-locator-manager.mjs'
import { getInjectableToken } from './utils/index.mjs'

export class ServiceLocator {
  private readonly eventBus: ServiceLocatorEventBus
  private readonly manager: ServiceLocatorManager
  private readonly serviceInstantiator: ServiceInstantiator
  private readonly requestContexts = new Map<string, RequestContextHolder>()
  private currentRequestContext: RequestContextHolder | null = null

  constructor(
    private readonly registry: Registry = globalRegistry,
    private readonly logger: Console | null = null,
    private readonly injectors: Injectors = defaultInjectors,
  ) {
    this.eventBus = new ServiceLocatorEventBus(logger)
    this.manager = new ServiceLocatorManager(logger)
    this.serviceInstantiator = new ServiceInstantiator(injectors)
  }

  // ============================================================================
  // PUBLIC METHODS
  // ============================================================================

  getEventBus() {
    return this.eventBus
  }

  getManager() {
    return this.manager
  }

  getRequestContexts() {
    return this.requestContexts
  }

  public getInstanceIdentifier(token: AnyInjectableType, args?: any): string {
    const [err, { actualToken, validatedArgs }] =
      this.validateAndResolveTokenArgs(token, args)
    if (err) {
      throw err
    }
    return this.generateInstanceName(actualToken, validatedArgs)
  }

  public async getInstance(
    token: AnyInjectableType,
    args?: any,
    onPrepare?: (data: {
      instanceName: string
      actualToken: InjectionTokenType
      validatedArgs?: any
    }) => void,
  ) {
    const [err, data] = await this.resolveTokenAndPrepareInstanceName(
      token,
      args,
    )
    if (err) {
      return [err]
    }

    const { instanceName, validatedArgs, actualToken, realToken } = data
    onPrepare?.({ instanceName, actualToken, validatedArgs })

    const [error, holder] = await this.retrieveOrCreateInstanceByInstanceName(
      instanceName,
      realToken,
      validatedArgs,
    )
    if (error) {
      return [error]
    }
    return [undefined, holder.instance]
  }

  public async getOrThrowInstance<Instance>(
    token: AnyInjectableType,
    args: any,
  ): Promise<Instance> {
    const [error, instance] = await this.getInstance(token, args)
    if (error) {
      throw error
    }
    return instance
  }

  public getSyncInstance<
    Instance,
    Schema extends InjectionTokenSchemaType | undefined,
  >(
    token: AnyInjectableType,
    args: Schema extends ZodObject
      ? z.input<Schema>
      : Schema extends ZodOptional<ZodObject>
        ? z.input<Schema> | undefined
        : undefined,
  ): Instance | null {
    const [err, { actualToken, validatedArgs }] =
      this.validateAndResolveTokenArgs(token, args)
    if (err) {
      return null
    }
    const instanceName = this.generateInstanceName(actualToken, validatedArgs)

    // Try request context first
    if (this.currentRequestContext) {
      const requestHolder = this.currentRequestContext.get(instanceName)
      if (requestHolder) {
        return requestHolder.instance as Instance
      }
    }

    // Try singleton manager
    const [error, holder] = this.manager.get(instanceName)
    if (error) {
      return null
    }
    return holder.instance as Instance
  }

  invalidate(service: string, round = 1): Promise<any> {
    this.logger?.log(
      `[ServiceLocator] Starting invalidation process for ${service}`,
    )
    const toInvalidate = this.manager.filter(
      (holder) => holder.name === service || holder.deps.has(service),
    )
    const promises = []
    for (const [key, holder] of toInvalidate.entries()) {
      promises.push(this.invalidateHolder(key, holder, round))
    }

    // Also invalidate request-scoped instances that depend on the service or match the service name
    for (const [requestId, requestContext] of this.requestContexts.entries()) {
      for (const [instanceName, holder] of requestContext.holders) {
        if (holder.name === service || holder.deps.has(service)) {
          this.logger?.log(
            `[ServiceLocator] Invalidating request-scoped instance ${instanceName} in request ${requestId} ${
              holder.name === service
                ? `(matches service name ${service})`
                : `(depends on ${service})`
            }`,
          )
          promises.push(
            this.invalidateRequestHolder(
              requestId,
              instanceName,
              holder,
              round,
            ),
          )
        }
      }
    }

    return Promise.all(promises)
  }

  /**
   * Gracefully clears all services in the ServiceLocator using invalidation logic.
   * This method respects service dependencies and ensures proper cleanup order.
   * Services that depend on others will be invalidated first, then their dependencies.
   *
   * @param options Optional configuration for the clearing process
   * @returns Promise that resolves when all services have been cleared
   */
  async clearAll(
    options: {
      /** Whether to also clear request contexts (default: true) */
      clearRequestContexts?: boolean
      /** Maximum number of invalidation rounds to prevent infinite loops (default: 10) */
      maxRounds?: number
      /** Whether to wait for all services to settle before starting (default: true) */
      waitForSettlement?: boolean
    } = {},
  ): Promise<void> {
    const {
      clearRequestContexts = true,
      maxRounds = 10,
      waitForSettlement = true,
    } = options

    this.logger?.log(
      '[ServiceLocator] Starting graceful clearing of all services',
    )

    // Wait for all services to settle if requested
    if (waitForSettlement) {
      this.logger?.log('[ServiceLocator] Waiting for all services to settle...')
      await this.ready()
    }

    // Get all service names that need to be cleared
    const allServiceNames = this.getAllServiceNames()

    if (allServiceNames.length === 0) {
      this.logger?.log('[ServiceLocator] No singleton services to clear')
    } else {
      this.logger?.log(
        `[ServiceLocator] Found ${allServiceNames.length} services to clear: ${allServiceNames.join(', ')}`,
      )

      // Clear services using dependency-aware invalidation
      await this.clearServicesWithDependencyAwareness(
        allServiceNames,
        maxRounds,
      )
    }

    // Clear request contexts if requested
    if (clearRequestContexts) {
      await this.clearAllRequestContexts()
    }

    this.logger?.log('[ServiceLocator] Graceful clearing completed')
  }

  /**
   * Clears services with dependency awareness, ensuring proper cleanup order.
   * Services with no dependencies are cleared first, then services that depend on them.
   */
  private async clearServicesWithDependencyAwareness(
    serviceNames: string[],
    maxRounds: number,
  ): Promise<void> {
    const clearedServices = new Set<string>()
    let round = 1

    while (clearedServices.size < serviceNames.length && round <= maxRounds) {
      this.logger?.log(
        `[ServiceLocator] Clearing round ${round}/${maxRounds}, ${clearedServices.size}/${serviceNames.length} services cleared`,
      )

      // Find services that can be cleared in this round
      const servicesToClearThisRound = this.findServicesReadyForClearing(
        serviceNames,
        clearedServices,
      )

      if (servicesToClearThisRound.length === 0) {
        // If no services can be cleared, try to clear remaining services anyway
        // This handles circular dependencies or other edge cases
        const remainingServices = serviceNames.filter(
          (name) => !clearedServices.has(name),
        )

        if (remainingServices.length > 0) {
          this.logger?.warn(
            `[ServiceLocator] No services ready for clearing, forcing cleanup of remaining: ${remainingServices.join(', ')}`,
          )
          await this.forceClearServices(remainingServices)
          remainingServices.forEach((name) => clearedServices.add(name))
        }
        break
      }

      // Clear services in this round
      const clearPromises = servicesToClearThisRound.map(
        async (serviceName) => {
          try {
            await this.invalidate(serviceName, round)
            clearedServices.add(serviceName)
            this.logger?.log(
              `[ServiceLocator] Successfully cleared service: ${serviceName}`,
            )
          } catch (error) {
            this.logger?.error(
              `[ServiceLocator] Error clearing service ${serviceName}:`,
              error,
            )
            // Still mark as cleared to avoid infinite loops
            clearedServices.add(serviceName)
          }
        },
      )

      await Promise.all(clearPromises)
      round++
    }

    if (clearedServices.size < serviceNames.length) {
      this.logger?.warn(
        `[ServiceLocator] Clearing completed after ${maxRounds} rounds, but ${serviceNames.length - clearedServices.size} services may not have been properly cleared`,
      )
    }
  }

  /**
   * Finds services that are ready to be cleared in the current round.
   * A service is ready if all its dependencies have already been cleared.
   */
  private findServicesReadyForClearing(
    allServiceNames: string[],
    clearedServices: Set<string>,
  ): string[] {
    return allServiceNames.filter((serviceName) => {
      if (clearedServices.has(serviceName)) {
        return false // Already cleared
      }

      // Check if this service has any dependencies that haven't been cleared yet
      const [error, holder] = this.manager.get(serviceName)
      if (error) {
        return true // Service not found or in error state, can be cleared
      }

      // Check if all dependencies have been cleared
      const hasUnclearedDependencies = Array.from(holder.deps).some(
        (dep) => !clearedServices.has(dep),
      )

      return !hasUnclearedDependencies
    })
  }

  /**
   * Force clears services that couldn't be cleared through normal dependency resolution.
   * This handles edge cases like circular dependencies.
   */
  private async forceClearServices(serviceNames: string[]): Promise<void> {
    const promises = serviceNames.map(async (serviceName) => {
      try {
        // Directly destroy the holder without going through normal invalidation
        const [error, holder] = this.manager.get(serviceName)
        if (!error && holder) {
          await this.destroyHolder(serviceName, holder)
        }
      } catch (error) {
        this.logger?.error(
          `[ServiceLocator] Error force clearing service ${serviceName}:`,
          error,
        )
      }
    })

    await Promise.all(promises)
  }

  /**
   * Gets all service names currently managed by the ServiceLocator.
   */
  private getAllServiceNames(): string[] {
    return this.manager.getAllNames()
  }

  /**
   * Clears all request contexts.
   */
  private async clearAllRequestContexts(): Promise<void> {
    const requestIds = Array.from(this.requestContexts.keys())

    if (requestIds.length === 0) {
      this.logger?.log('[ServiceLocator] No request contexts to clear')
      return
    }

    this.logger?.log(
      `[ServiceLocator] Clearing ${requestIds.length} request contexts: ${requestIds.join(', ')}`,
    )

    // Clear request contexts sequentially to avoid race conditions
    for (const requestId of requestIds) {
      try {
        await this.endRequest(requestId)
      } catch (error) {
        this.logger?.error(
          `[ServiceLocator] Error clearing request context ${requestId}:`,
          error,
        )
        // Continue with other request contexts even if one fails
      }
    }
  }

  /**
   * Invalidates a single holder based on its current status.
   */
  private async invalidateHolder(
    key: string,
    holder: ServiceLocatorInstanceHolder<any>,
    round: number,
  ): Promise<void> {
    await this.invalidateHolderByStatus(holder, round, {
      context: key,
      isRequestScoped: false,
      onDestroying: () =>
        this.logger?.trace(
          `[ServiceLocator] ${key} is already being destroyed`,
        ),
      onCreating: () =>
        this.logger?.trace(
          `[ServiceLocator] ${key} is being created, waiting...`,
        ),
      onCreationError: () =>
        this.logger?.error(
          `[ServiceLocator] ${key} creation triggered too many invalidation rounds`,
        ),
      onRecursiveInvalidate: () => this.invalidate(key, round + 1),
      onDestroy: () => this.destroyHolder(key, holder),
    })
  }

  /**
   * Invalidates a request-scoped holder based on its current status.
   */
  private async invalidateRequestHolder(
    requestId: string,
    instanceName: string,
    holder: ServiceLocatorInstanceHolder<any>,
    round: number,
  ): Promise<void> {
    await this.invalidateHolderByStatus(holder, round, {
      context: `Request-scoped ${instanceName} in ${requestId}`,
      isRequestScoped: true,
      onDestroying: () =>
        this.logger?.trace(
          `[ServiceLocator] Request-scoped ${instanceName} in ${requestId} is already being destroyed`,
        ),
      onCreating: () =>
        this.logger?.trace(
          `[ServiceLocator] Request-scoped ${instanceName} in ${requestId} is being created, waiting...`,
        ),
      onCreationError: () =>
        this.logger?.error(
          `[ServiceLocator] Request-scoped ${instanceName} in ${requestId} creation triggered too many invalidation rounds`,
        ),
      onRecursiveInvalidate: () =>
        this.invalidateRequestHolder(
          requestId,
          instanceName,
          holder,
          round + 1,
        ),
      onDestroy: () =>
        this.destroyRequestHolder(requestId, instanceName, holder),
    })
  }

  /**
   * Common invalidation logic for holders based on their status.
   */
  private async invalidateHolderByStatus(
    holder: ServiceLocatorInstanceHolder<any>,
    round: number,
    options: {
      context: string
      isRequestScoped: boolean
      onDestroying: () => void
      onCreating: () => void
      onCreationError: () => void
      onRecursiveInvalidate: () => Promise<void>
      onDestroy: () => Promise<void>
    },
  ): Promise<void> {
    switch (holder.status) {
      case ServiceLocatorInstanceHolderStatus.Destroying:
        options.onDestroying()
        await holder.destroyPromise
        break

      case ServiceLocatorInstanceHolderStatus.Creating:
        options.onCreating()
        await holder.creationPromise
        if (round > 3) {
          options.onCreationError()
          return
        }
        await options.onRecursiveInvalidate()
        break

      default:
        await options.onDestroy()
        break
    }
  }

  /**
   * Destroys a holder and cleans up its resources.
   */
  private async destroyHolder(
    key: string,
    holder: ServiceLocatorInstanceHolder<any>,
  ): Promise<void> {
    await this.destroyHolderWithCleanup(holder, {
      context: key,
      logMessage: `[ServiceLocator] Invalidating ${key} and notifying listeners`,
      cleanup: () => this.manager.delete(key),
      eventName: key,
    })
  }

  /**
   * Destroys a request-scoped holder and cleans up its resources.
   */
  private async destroyRequestHolder(
    requestId: string,
    instanceName: string,
    holder: ServiceLocatorInstanceHolder<any>,
  ): Promise<void> {
    await this.destroyHolderWithCleanup(holder, {
      context: `Request-scoped ${instanceName} in ${requestId}`,
      logMessage: `[ServiceLocator] Invalidating request-scoped ${instanceName} in ${requestId} and notifying listeners`,
      cleanup: () => {
        const requestContext = this.requestContexts.get(requestId)
        if (requestContext) {
          requestContext.delete(instanceName)
        }
      },
      eventName: instanceName,
    })
  }

  /**
   * Common destroy logic for holders with customizable cleanup.
   */
  private async destroyHolderWithCleanup(
    holder: ServiceLocatorInstanceHolder<any>,
    options: {
      context: string
      logMessage: string
      cleanup: () => void
      eventName: string
    },
  ): Promise<void> {
    holder.status = ServiceLocatorInstanceHolderStatus.Destroying
    this.logger?.log(options.logMessage)

    holder.destroyPromise = Promise.all(
      holder.destroyListeners.map((listener) => listener()),
    ).then(async () => {
      holder.destroyListeners = []
      holder.deps.clear()
      options.cleanup()
      await this.emitInstanceEvent(options.eventName, 'destroy')
    })

    await holder.destroyPromise
  }

  async ready() {
    const holders = Array.from(this.manager.filter(() => true)).map(
      ([, holder]) => holder,
    )
    await Promise.all(
      holders.map((holder) => this.waitForHolderToSettle(holder)),
    )
  }

  /**
   * Waits for a holder to settle (either created, destroyed, or error state).
   */
  private async waitForHolderToSettle(
    holder: ServiceLocatorInstanceHolder<any>,
  ): Promise<void> {
    switch (holder.status) {
      case ServiceLocatorInstanceHolderStatus.Creating:
        await holder.creationPromise
        break
      case ServiceLocatorInstanceHolderStatus.Destroying:
        await holder.destroyPromise
        break
      // Already settled states
      case ServiceLocatorInstanceHolderStatus.Created:
      case ServiceLocatorInstanceHolderStatus.Error:
        break
    }
  }

  // ============================================================================
  // REQUEST CONTEXT MANAGEMENT
  // ============================================================================

  /**
   * Begins a new request context with the given parameters.
   * @param requestId Unique identifier for this request
   * @param metadata Optional metadata for the request
   * @param priority Priority for resolution (higher = more priority)
   * @returns The created request context holder
   */
  beginRequest(
    requestId: string,
    metadata?: Record<string, any>,
    priority: number = 100,
  ): RequestContextHolder {
    if (this.requestContexts.has(requestId)) {
      throw new Error(
        `[ServiceLocator] Request context ${requestId} already exists`,
      )
    }

    const contextHolder = new DefaultRequestContextHolder(
      requestId,
      priority,
      metadata,
    )
    this.requestContexts.set(requestId, contextHolder)
    this.currentRequestContext = contextHolder

    this.logger?.log(`[ServiceLocator] Started request context: ${requestId}`)
    return contextHolder
  }

  /**
   * Ends a request context and cleans up all associated instances.
   * @param requestId The request ID to end
   */
  async endRequest(requestId: string): Promise<void> {
    const contextHolder = this.requestContexts.get(requestId)
    if (!contextHolder) {
      this.logger?.warn(
        `[ServiceLocator] Request context ${requestId} not found`,
      )
      return
    }

    this.logger?.log(`[ServiceLocator] Ending request context: ${requestId}`)

    // Clean up all request-scoped instances
    const cleanupPromises: Promise<any>[] = []
    for (const [, holder] of contextHolder.holders) {
      if (holder.destroyListeners.length > 0) {
        cleanupPromises.push(
          Promise.all(holder.destroyListeners.map((listener) => listener())),
        )
      }
    }

    await Promise.all(cleanupPromises)

    // Clear the context
    contextHolder.clear()
    this.requestContexts.delete(requestId)

    // Reset current context if it was the one being ended
    if (this.currentRequestContext === contextHolder) {
      this.currentRequestContext =
        Array.from(this.requestContexts.values()).at(-1) ?? null
    }

    this.logger?.log(`[ServiceLocator] Request context ${requestId} ended`)
  }

  /**
   * Gets the current request context.
   * @returns The current request context holder or null
   */
  getCurrentRequestContext(): RequestContextHolder | null {
    return this.currentRequestContext
  }

  /**
   * Sets the current request context.
   * @param requestId The request ID to set as current
   */
  setCurrentRequestContext(requestId: string): void {
    const contextHolder = this.requestContexts.get(requestId)
    if (!contextHolder) {
      throw new Error(`[ServiceLocator] Request context ${requestId} not found`)
    }
    this.currentRequestContext = contextHolder
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  /**
   * Validates and resolves token arguments, handling factory token resolution and validation.
   */
  private validateAndResolveTokenArgs(
    token: AnyInjectableType,
    args?: any,
  ): [
    FactoryTokenNotResolved | UnknownError | undefined,
    { actualToken: InjectionTokenType; validatedArgs?: any },
  ] {
    let actualToken = token as InjectionToken<any, any>
    if (typeof token === 'function') {
      actualToken = getInjectableToken(token)
    }
    let realArgs = args
    if (actualToken instanceof BoundInjectionToken) {
      realArgs = actualToken.value
    } else if (actualToken instanceof FactoryInjectionToken) {
      if (actualToken.resolved) {
        realArgs = actualToken.value
      } else {
        return [new FactoryTokenNotResolved(token.name), { actualToken }]
      }
    }
    if (!actualToken.schema) {
      return [undefined, { actualToken, validatedArgs: realArgs }]
    }
    const validatedArgs = actualToken.schema?.safeParse(realArgs)
    if (validatedArgs && !validatedArgs.success) {
      this.logger?.error(
        `[ServiceLocator]#validateAndResolveTokenArgs(): Error validating args for ${actualToken.name.toString()}`,
        validatedArgs.error,
      )
      return [new UnknownError(validatedArgs.error), { actualToken }]
    }
    return [undefined, { actualToken, validatedArgs: validatedArgs?.data }]
  }

  /**
   * Internal method to resolve token args and create instance name.
   * Handles factory token resolution and validation.
   */
  private async resolveTokenAndPrepareInstanceName(
    token: AnyInjectableType,
    args?: any,
  ): Promise<
    | [
        undefined,
        {
          instanceName: string
          validatedArgs: any
          actualToken: InjectionTokenType
          realToken: InjectionToken<any, any>
        },
      ]
    | [UnknownError | FactoryTokenNotResolved]
  > {
    const [err, { actualToken, validatedArgs }] =
      this.validateAndResolveTokenArgs(token, args)
    if (err instanceof UnknownError) {
      return [err]
    } else if (
      (err as any) instanceof FactoryTokenNotResolved &&
      actualToken instanceof FactoryInjectionToken
    ) {
      this.logger?.log(
        `[ServiceLocator]#resolveTokenAndPrepareInstanceName() Factory token not resolved, resolving it`,
      )
      await actualToken.resolve(this.createFactoryContext())
      return this.resolveTokenAndPrepareInstanceName(token)
    }
    const instanceName = this.generateInstanceName(actualToken, validatedArgs)
    // Determine the real token (the actual InjectionToken that will be used for resolution)
    const realToken =
      actualToken instanceof BoundInjectionToken ||
      actualToken instanceof FactoryInjectionToken
        ? actualToken.token
        : actualToken
    return [undefined, { instanceName, validatedArgs, actualToken, realToken }]
  }

  /**
   * Gets an instance by its instance name, handling all the logic after instance name creation.
   */
  private async retrieveOrCreateInstanceByInstanceName(
    instanceName: string,
    realToken: InjectionToken<any, any>,
    realArgs: any,
  ): Promise<
    | [undefined, ServiceLocatorInstanceHolder<any>]
    | [UnknownError | FactoryNotFound]
  > {
    // Try to get existing instance (handles both request-scoped and singleton)
    const existingHolder = await this.tryGetExistingInstance(
      instanceName,
      realToken,
    )
    if (existingHolder) {
      return existingHolder
    }

    // No existing instance found, create a new one
    const result = await this.createNewInstance(
      instanceName,
      realToken,
      realArgs,
    )
    if (result[0]) {
      return [result[0]]
    }

    const [, holder] = result
    return this.waitForInstanceReady(holder)
  }

  /**
   * Attempts to retrieve an existing instance, handling request-scoped and singleton instances.
   * Returns null if no instance exists and a new one should be created.
   */
  private async tryGetExistingInstance(
    instanceName: string,
    realToken: InjectionToken<any, any>,
  ): Promise<
    [undefined, ServiceLocatorInstanceHolder<any>] | [UnknownError] | null
  > {
    // Check request-scoped instances first
    const requestResult = await this.tryGetRequestScopedInstance(
      instanceName,
      realToken,
    )
    if (requestResult) {
      return requestResult
    }

    // Check singleton instances
    return this.tryGetSingletonInstance(instanceName)
  }

  /**
   * Attempts to get a request-scoped instance if applicable.
   */
  private async tryGetRequestScopedInstance(
    instanceName: string,
    realToken: InjectionToken<any, any>,
  ): Promise<
    [undefined, ServiceLocatorInstanceHolder<any>] | [UnknownError] | null
  > {
    if (!this.registry.has(realToken)) {
      return null
    }

    const record = this.registry.get(realToken)
    if (record.scope !== InjectableScope.Request) {
      return null
    }

    if (!this.currentRequestContext) {
      this.logger?.log(
        `[ServiceLocator] No current request context available for request-scoped service ${instanceName}`,
      )
      return [new UnknownError(ErrorsEnum.InstanceNotFound)]
    }

    const requestHolder = this.currentRequestContext.get(instanceName)
    if (!requestHolder) {
      return null
    }

    return this.waitForInstanceReady(requestHolder)
  }

  /**
   * Attempts to get a singleton instance from the manager.
   */
  private async tryGetSingletonInstance(
    instanceName: string,
  ): Promise<
    [undefined, ServiceLocatorInstanceHolder<any>] | [UnknownError] | null
  > {
    const [error, holder] = this.manager.get(instanceName)

    if (!error) {
      return this.waitForInstanceReady(holder)
    }

    // Handle recovery scenarios
    switch (error.code) {
      case ErrorsEnum.InstanceDestroying:
        this.logger?.log(
          `[ServiceLocator] Instance ${instanceName} is being destroyed, waiting...`,
        )
        await holder?.destroyPromise
        // Retry after destruction is complete
        return this.tryGetSingletonInstance(instanceName)

      case ErrorsEnum.InstanceExpired:
        this.logger?.log(
          `[ServiceLocator] Instance ${instanceName} expired, invalidating...`,
        )
        await this.invalidate(instanceName)
        // Retry after invalidation
        return this.tryGetSingletonInstance(instanceName)

      case ErrorsEnum.InstanceNotFound:
        return null // Instance doesn't exist, should create new one

      default:
        return [error]
    }
  }

  /**
   * Waits for an instance holder to be ready and returns the appropriate result.
   */
  private async waitForInstanceReady<T>(
    holder: ServiceLocatorInstanceHolder<T>,
  ): Promise<[undefined, ServiceLocatorInstanceHolder<T>] | [UnknownError]> {
    switch (holder.status) {
      case ServiceLocatorInstanceHolderStatus.Creating:
        await holder.creationPromise
        return this.waitForInstanceReady(holder)

      case ServiceLocatorInstanceHolderStatus.Destroying:
        return [new UnknownError(ErrorsEnum.InstanceDestroying)]

      case ServiceLocatorInstanceHolderStatus.Error:
        return [holder.instance as UnknownError]

      case ServiceLocatorInstanceHolderStatus.Created:
        return [undefined, holder]

      default:
        return [new UnknownError(ErrorsEnum.InstanceNotFound)]
    }
  }

  /**
   * Emits events to listeners for instance lifecycle events.
   */
  private emitInstanceEvent(
    name: string,
    event: 'create' | 'destroy' = 'create',
  ) {
    this.logger?.log(
      `[ServiceLocator]#emitInstanceEvent() Notifying listeners for ${name} with event ${event}`,
    )
    return this.eventBus.emit(name, event)
  }

  /**
   * Creates a new instance for the given token and arguments.
   */
  private async createNewInstance<
    Instance,
    Schema extends InjectionTokenSchemaType | undefined,
  >(
    instanceName: string,
    realToken: InjectionToken<Instance, Schema>,
    args: Schema extends ZodObject
      ? z.output<Schema>
      : Schema extends ZodOptional<ZodObject>
        ? z.output<Schema> | undefined
        : undefined,
  ): Promise<
    | [undefined, ServiceLocatorInstanceHolder<Instance>]
    | [FactoryNotFound | UnknownError]
  > {
    this.logger?.log(
      `[ServiceLocator]#createNewInstance() Creating instance for ${instanceName}`,
    )
    if (this.registry.has(realToken)) {
      return this.instantiateServiceFromRegistry<Instance, Schema, any>(
        instanceName,
        realToken,
        args,
      )
    } else {
      return [new FactoryNotFound(realToken.name.toString())]
    }
  }

  /**
   * Instantiates a service from the registry using the service instantiator.
   */
  private instantiateServiceFromRegistry<
    Instance,
    Schema extends InjectionTokenSchemaType | undefined,
    Args extends Schema extends BaseInjectionTokenSchemaType
      ? z.output<Schema>
      : Schema extends OptionalInjectionTokenSchemaType
        ? z.output<Schema> | undefined
        : undefined,
  >(
    instanceName: string,
    token: InjectionToken<Instance, Schema>,
    args: Args,
  ): Promise<[undefined, ServiceLocatorInstanceHolder<Instance>]> {
    this.logger?.log(
      `[ServiceLocator]#instantiateServiceFromRegistry(): Creating instance for ${instanceName} from abstract factory`,
    )
    const ctx = this.createFactoryContext(
      this.currentRequestContext || undefined,
    )
    let record = this.registry.get<Instance, Schema>(token)
    let { scope, type } = record

    // Use createCreatingHolder from manager
    const [deferred, holder] = this.manager.createCreatingHolder<Instance>(
      instanceName,
      type,
      scope,
      ctx.deps,
      Infinity,
    )

    // Start the instantiation process
    this.serviceInstantiator
      .instantiateService(ctx, record, args)
      .then(async ([error, instance]) => {
        await this.handleInstantiationResult(
          instanceName,
          holder,
          ctx,
          deferred,
          scope,
          error,
          instance,
        )
      })
      .catch(async (error) => {
        await this.handleInstantiationError(
          instanceName,
          holder,
          deferred,
          scope,
          error,
        )
      })

    this.storeInstanceByScope(scope, instanceName, holder)
    // @ts-expect-error TS2322 This is correct type
    return [undefined, holder]
  }

  /**
   * Handles the result of service instantiation.
   */
  private async handleInstantiationResult(
    instanceName: string,
    holder: ServiceLocatorInstanceHolder<any>,
    ctx: any,
    deferred: any,
    scope: InjectableScope,
    error: any,
    instance: any,
  ): Promise<void> {
    holder.destroyListeners = ctx.getDestroyListeners()
    holder.creationPromise = null

    if (error) {
      await this.handleInstantiationError(
        instanceName,
        holder,
        deferred,
        scope,
        error,
      )
    } else {
      await this.handleInstantiationSuccess(
        instanceName,
        holder,
        ctx,
        deferred,
        instance,
      )
    }
  }

  /**
   * Handles successful service instantiation.
   */
  private async handleInstantiationSuccess(
    instanceName: string,
    holder: ServiceLocatorInstanceHolder<any>,
    ctx: any,
    deferred: any,
    instance: any,
  ): Promise<void> {
    holder.instance = instance
    holder.status = ServiceLocatorInstanceHolderStatus.Created

    // Set up dependency invalidation listeners
    if (ctx.deps.size > 0) {
      ctx.deps.forEach((dependency: string) => {
        holder.destroyListeners.push(
          this.eventBus.on(dependency, 'destroy', () =>
            this.invalidate(instanceName),
          ),
        )
      })
    }

    await this.emitInstanceEvent(instanceName)
    deferred.resolve([undefined, instance])
  }

  /**
   * Handles service instantiation errors.
   */
  private async handleInstantiationError(
    instanceName: string,
    holder: ServiceLocatorInstanceHolder<any>,
    deferred: any,
    scope: InjectableScope,
    error: any,
  ): Promise<void> {
    this.logger?.error(
      `[ServiceLocator] Error creating instance for ${instanceName}`,
      error,
    )

    holder.status = ServiceLocatorInstanceHolderStatus.Error
    holder.instance = error
    holder.creationPromise = null

    if (scope === InjectableScope.Singleton) {
      setTimeout(() => this.invalidate(instanceName), 10)
    }

    deferred.reject(error)
  }

  /**
   * Stores an instance holder based on its scope.
   */
  private storeInstanceByScope(
    scope: InjectableScope,
    instanceName: string,
    holder: ServiceLocatorInstanceHolder<any>,
  ): void {
    switch (scope) {
      case InjectableScope.Singleton:
        this.logger?.debug(
          `[ServiceLocator] Setting singleton instance for ${instanceName}`,
        )
        this.manager.set(instanceName, holder)
        break

      case InjectableScope.Request:
        if (this.currentRequestContext) {
          this.logger?.debug(
            `[ServiceLocator] Setting request-scoped instance for ${instanceName}`,
          )
          this.currentRequestContext.addInstance(
            instanceName,
            holder.instance,
            holder,
          )
        }
        break

      case InjectableScope.Transient:
        // Transient instances are not stored anywhere
        break
    }
  }

  /**
   * Tries to get a pre-prepared instance from request contexts.
   */
  private tryGetPrePreparedInstance(
    instanceName: string,
    contextHolder: RequestContextHolder | undefined,
    deps: Set<string>,
  ): any {
    // Check provided context holder first (if has higher priority)
    if (contextHolder && contextHolder.priority > 0) {
      const prePreparedInstance = contextHolder.get(instanceName)?.instance
      if (prePreparedInstance !== undefined) {
        this.logger?.debug(
          `[ServiceLocator] Using pre-prepared instance ${instanceName} from request context ${contextHolder.requestId}`,
        )
        deps.add(instanceName)
        return prePreparedInstance
      }
    }

    // Check current request context (if different from provided contextHolder)
    if (
      this.currentRequestContext &&
      this.currentRequestContext !== contextHolder
    ) {
      const prePreparedInstance =
        this.currentRequestContext.get(instanceName)?.instance
      if (prePreparedInstance !== undefined) {
        this.logger?.debug(
          `[ServiceLocator] Using pre-prepared instance ${instanceName} from current request context ${this.currentRequestContext.requestId}`,
        )
        deps.add(instanceName)
        return prePreparedInstance
      }
    }

    return undefined
  }

  /**
   * Creates a factory context for dependency injection during service instantiation.
   * @param contextHolder Optional request context holder for priority-based resolution
   */
  private createFactoryContext(
    contextHolder?: RequestContextHolder,
  ): FactoryContext & {
    getDestroyListeners: () => (() => void)[]
    deps: Set<string>
  } {
    const destroyListeners = new Set<() => void>()
    const deps = new Set<string>()
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this

    function addDestroyListener(listener: () => void) {
      destroyListeners.add(listener)
    }

    function getDestroyListeners() {
      return Array.from(destroyListeners)
    }

    return {
      // @ts-expect-error This is correct type
      async inject(token, args) {
        const instanceName = self.generateInstanceName(token, args)

        // Check request contexts for pre-prepared instances
        const prePreparedInstance = self.tryGetPrePreparedInstance(
          instanceName,
          contextHolder,
          deps,
        )
        if (prePreparedInstance !== undefined) {
          return prePreparedInstance
        }

        // Fall back to normal resolution
        const [error, instance] = await self.getInstance(
          token,
          args,
          ({ instanceName }) => {
            deps.add(instanceName)
          },
        )
        if (error) {
          throw error
        }
        return instance
      },
      addDestroyListener,
      getDestroyListeners,
      locator: self,
      deps,
    }
  }

  /**
   * Generates a unique instance name based on token and arguments.
   */
  private generateInstanceName(token: InjectionTokenType, args: any) {
    if (!args) {
      return token.toString()
    }

    const formattedArgs = Object.entries(args)
      .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
      .map(([key, value]) => `${key}=${this.formatArgValue(value)}`)
      .join(',')

    return `${token.toString()}:${formattedArgs.replaceAll(/"/g, '').replaceAll(/:/g, '=')}`
  }

  /**
   * Formats a single argument value for instance name generation.
   */
  private formatArgValue(value: any): string {
    if (typeof value === 'function') {
      return `fn_${value.name}(${value.length})`
    }
    if (typeof value === 'symbol') {
      return value.toString()
    }
    return JSON.stringify(value).slice(0, 40)
  }
}
