/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-empty-object-type */
import type { z, ZodObject, ZodOptional } from 'zod/v4'

import type {
  AnyInjectableType,
  InjectionTokenSchemaType,
} from './injection-token.mjs'
import type { Registry } from './registry.mjs'
import type { RequestContextHolder } from './request-context-holder.mjs'
import type { ClearAllOptions } from './service-invalidator.mjs'
import type { Injectors } from './utils/index.mjs'

import { defaultInjectors } from './injector.mjs'
import { InstanceResolver } from './instance-resolver.mjs'
import { globalRegistry } from './registry.mjs'
import { RequestContextManager } from './request-context-manager.mjs'
import { ServiceInstantiator } from './service-instantiator.mjs'
import { ServiceInvalidator } from './service-invalidator.mjs'
import { ServiceLocatorEventBus } from './service-locator-event-bus.mjs'
import { ServiceLocatorManager } from './service-locator-manager.mjs'
import { TokenProcessor } from './token-processor.mjs'

export class ServiceLocator {
  private readonly eventBus: ServiceLocatorEventBus
  private readonly manager: ServiceLocatorManager
  private readonly serviceInstantiator: ServiceInstantiator
  private readonly tokenProcessor: TokenProcessor
  private readonly requestContextManager: RequestContextManager
  private readonly serviceInvalidator: ServiceInvalidator
  private readonly instanceResolver: InstanceResolver

  constructor(
    private readonly registry: Registry = globalRegistry,
    private readonly logger: Console | null = null,
    private readonly injectors: Injectors = defaultInjectors,
  ) {
    this.eventBus = new ServiceLocatorEventBus(logger)
    this.manager = new ServiceLocatorManager(logger)
    this.serviceInstantiator = new ServiceInstantiator(injectors)
    this.tokenProcessor = new TokenProcessor(logger)
    this.requestContextManager = new RequestContextManager(logger)
    this.serviceInvalidator = new ServiceInvalidator(
      this.manager,
      this.requestContextManager,
      this.eventBus,
      logger,
    )
    this.instanceResolver = new InstanceResolver(
      this.registry,
      this.manager,
      this.serviceInstantiator,
      this.tokenProcessor,
      logger,
      this,
    )
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
    return this.requestContextManager.getRequestContexts()
  }

  getRequestContextManager() {
    return this.requestContextManager
  }

  getServiceInvalidator() {
    return this.serviceInvalidator
  }

  public getInstanceIdentifier(token: AnyInjectableType, args?: any): string {
    const [err, { actualToken, validatedArgs }] =
      this.tokenProcessor.validateAndResolveTokenArgs(token, args)
    if (err) {
      throw err
    }
    return this.tokenProcessor.generateInstanceName(actualToken, validatedArgs)
  }

  public async getInstance(
    token: AnyInjectableType,
    args?: any,
    onPrepare?: (data: {
      instanceName: string
      actualToken: any
      validatedArgs?: any
    }) => void,
  ) {
    const [err, data] = await this.instanceResolver.resolveInstance(
      token,
      args,
      this.requestContextManager.getCurrentRequestContext() || undefined,
    )
    if (err) {
      return [err]
    }

    // Call onPrepare callback if provided
    if (onPrepare) {
      const instanceName = this.getInstanceIdentifier(token, args)
      const [tokenErr, { actualToken, validatedArgs }] =
        this.tokenProcessor.validateAndResolveTokenArgs(token, args)
      if (!tokenErr) {
        onPrepare({ instanceName, actualToken, validatedArgs })
      }
    }

    return [undefined, data]
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
    return this.instanceResolver.getSyncInstance(
      token,
      args as any,
      this.requestContextManager.getCurrentRequestContext(),
    )
  }

  invalidate(service: string, round = 1): Promise<any> {
    return this.serviceInvalidator.invalidate(service, round)
  }

  /**
   * Gracefully clears all services in the ServiceLocator using invalidation logic.
   * This method respects service dependencies and ensures proper cleanup order.
   * Services that depend on others will be invalidated first, then their dependencies.
   *
   * @param options Optional configuration for the clearing process
   * @returns Promise that resolves when all services have been cleared
   */
  async clearAll(options: ClearAllOptions = {}): Promise<void> {
    return this.serviceInvalidator.clearAll(options)
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
    return this.requestContextManager.beginRequest(
      requestId,
      metadata,
      priority,
    )
  }

  /**
   * Ends a request context and cleans up all associated instances.
   * @param requestId The request ID to end
   */
  async endRequest(requestId: string): Promise<void> {
    return this.requestContextManager.endRequest(requestId)
  }

  /**
   * Gets the current request context.
   * @returns The current request context holder or null
   */
  getCurrentRequestContext(): RequestContextHolder | null {
    return this.requestContextManager.getCurrentRequestContext()
  }

  /**
   * Sets the current request context.
   * @param requestId The request ID to set as current
   */
  setCurrentRequestContext(requestId: string): void {
    return this.requestContextManager.setCurrentRequestContext(requestId)
  }

  /**
   * Waits for all services to settle (either created, destroyed, or error state).
   */
  async ready(): Promise<void> {
    return this.serviceInvalidator.ready()
  }

  /**
   * Helper method for TokenProcessor to access pre-prepared instances.
   * This is needed for the factory context creation.
   */
  tryGetPrePreparedInstance(
    instanceName: string,
    contextHolder: RequestContextHolder | undefined,
    deps: Set<string>,
  ): any {
    return this.tokenProcessor.tryGetPrePreparedInstance(
      instanceName,
      contextHolder,
      deps,
      this.requestContextManager.getCurrentRequestContext(),
    )
  }

  /**
   * Helper method for InstanceResolver to generate instance names.
   * This is needed for the factory context creation.
   */
  generateInstanceName(token: any, args: any): string {
    return this.tokenProcessor.generateInstanceName(token, args)
  }
}
