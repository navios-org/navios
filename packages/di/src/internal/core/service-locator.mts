/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-empty-object-type */
import type { z, ZodObject, ZodOptional } from 'zod/v4'

import type {
  AnyInjectableType,
  InjectionTokenSchemaType,
} from '../../token/injection-token.mjs'
import type { IContainer } from '../../interfaces/container.interface.mjs'
import type { Registry } from '../../token/registry.mjs'
import type { ScopedContainer } from '../../container/scoped-container.mjs'
import type { ClearAllOptions } from './invalidator.mjs'
import type { Injectors } from '../../utils/index.mjs'

import { defaultInjectors } from '../../injectors.mjs'
import { InstanceResolver } from './instance-resolver.mjs'
import { globalRegistry } from '../../token/registry.mjs'
import { Instantiator } from './instantiator.mjs'
import { Invalidator } from './invalidator.mjs'
import { LifecycleEventBus } from '../lifecycle/lifecycle-event-bus.mjs'
import { HolderManager } from '../holder/holder-manager.mjs'
import { TokenProcessor } from './token-processor.mjs'

/**
 * Core DI engine that coordinates service instantiation, resolution, and lifecycle.
 *
 * Acts as the central orchestrator for dependency injection operations,
 * delegating to specialized components (InstanceResolver, Instantiator, Invalidator)
 * for specific tasks.
 */
export class ServiceLocator {
  private readonly eventBus: LifecycleEventBus
  private readonly manager: HolderManager
  private readonly instantiator: Instantiator
  private readonly tokenProcessor: TokenProcessor
  private readonly invalidator: Invalidator
  private readonly instanceResolver: InstanceResolver

  constructor(
    private readonly registry: Registry = globalRegistry,
    private readonly logger: Console | null = null,
    private readonly injectors: Injectors = defaultInjectors,
  ) {
    this.eventBus = new LifecycleEventBus(logger)
    this.manager = new HolderManager(logger)
    this.instantiator = new Instantiator(injectors)
    this.tokenProcessor = new TokenProcessor(logger)
    this.invalidator = new Invalidator(
      this.manager,
      this.eventBus,
      logger,
    )
    this.instanceResolver = new InstanceResolver(
      this.registry,
      this.manager,
      this.instantiator,
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

  getInvalidator() {
    return this.invalidator
  }

  /** @deprecated Use getInvalidator() instead */
  getServiceInvalidator() {
    return this.invalidator
  }

  getTokenProcessor() {
    return this.tokenProcessor
  }

  public getInstanceIdentifier(token: AnyInjectableType, args?: any): string {
    const [err, { actualToken, validatedArgs }] =
      this.tokenProcessor.validateAndResolveTokenArgs(token, args)
    if (err) {
      throw err
    }
    return this.tokenProcessor.generateInstanceName(actualToken, validatedArgs)
  }

  /**
   * Gets or creates an instance for the given token.
   * @param token The injection token
   * @param args Optional arguments
   * @param contextContainer The container to use for creating FactoryContext
   */
  public async getInstance(
    token: AnyInjectableType,
    args: any,
    contextContainer: IContainer,
  ) {
    const [err, data] = await this.instanceResolver.resolveInstance(
      token,
      args,
      contextContainer,
    )
    if (err) {
      return [err]
    }

    return [undefined, data]
  }

  /**
   * Gets or throws an instance for the given token.
   * @param token The injection token
   * @param args Optional arguments
   * @param contextContainer The container to use for creating FactoryContext
   */
  public async getOrThrowInstance<Instance>(
    token: AnyInjectableType,
    args: any,
    contextContainer: IContainer,
  ): Promise<Instance> {
    const [error, instance] = await this.getInstance(token, args, contextContainer)
    if (error) {
      throw error
    }
    return instance
  }

  /**
   * Resolves a request-scoped service for a ScopedContainer.
   * The service will be stored in the ScopedContainer's request context.
   *
   * @param token The injection token
   * @param args Optional arguments
   * @param scopedContainer The ScopedContainer that owns the request context
   */
  public async resolveRequestScoped(
    token: AnyInjectableType,
    args: any,
    scopedContainer: ScopedContainer,
  ): Promise<any> {
    const [err, data] = await this.instanceResolver.resolveRequestScopedInstance(
      token,
      args,
      scopedContainer,
    )
    if (err) {
      throw err
    }
    return data
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
    contextContainer: IContainer,
  ): Instance | null {
    return this.instanceResolver.getSyncInstance(token, args as any, contextContainer)
  }

  invalidate(service: string, round = 1): Promise<any> {
    return this.invalidator.invalidate(service, round)
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
    return this.invalidator.clearAll(options)
  }

  /**
   * Waits for all services to settle (either created, destroyed, or error state).
   */
  async ready(): Promise<void> {
    return this.invalidator.ready()
  }

  /**
   * Helper method for InstanceResolver to generate instance names.
   * This is needed for the factory context creation.
   */
  generateInstanceName(token: any, args: any): string {
    return this.tokenProcessor.generateInstanceName(token, args)
  }
}
