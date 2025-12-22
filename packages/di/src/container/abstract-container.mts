import type { z, ZodType } from 'zod/v4'

import type { IContainer } from '../interfaces/container.interface.mjs'
import type { Factorable } from '../interfaces/factory.interface.mjs'
import type { NameResolver } from '../internal/core/name-resolver.mjs'
import type { ServiceInvalidator } from '../internal/core/service-invalidator.mjs'
import type { TokenResolver } from '../internal/core/token-resolver.mjs'
import type {
  ClassType,
  ClassTypeWithArgument,
  InjectionTokenSchemaType,
} from '../token/injection-token.mjs'
import type { Registry } from '../token/registry.mjs'
import type { Join, UnionToArray } from '../utils/types.mjs'

import { InjectableScope, InjectableType } from '../enums/index.mjs'
import { DIError, DIErrorCode } from '../errors/index.mjs'
import { InstanceStatus } from '../internal/holder/instance-holder.mjs'
import { UnifiedStorage } from '../internal/holder/unified-storage.mjs'
import { StubFactoryClass } from '../internal/index.mjs'
import {
  BoundInjectionToken,
  FactoryInjectionToken,
  InjectionToken,
} from '../token/injection-token.mjs'

/**
 * Abstract base class for dependency injection containers.
 *
 * Provides shared implementation for common container operations.
 * Both Container and ScopedContainer extend this class.
 */
export abstract class AbstractContainer implements IContainer {
  /**
   * The default scope used when adding instances without explicit registration.
   */
  protected abstract readonly defaultScope: InjectableScope

  /**
   * The request ID for scoped containers, undefined for root container.
   */
  protected abstract readonly requestId: string | undefined

  // ============================================================================
  // ABSTRACT METHODS - Must be implemented by subclasses
  // ============================================================================

  /**
   * Gets the storage for this container.
   */
  abstract getStorage(): UnifiedStorage

  /**
   * Gets the registry for this container.
   */
  protected abstract getRegistry(): Registry

  /**
   * Gets the token resolver.
   */
  protected abstract getTokenResolver(): TokenResolver

  /**
   * Gets the name resolver.
   */
  protected abstract getNameResolver(): NameResolver

  /**
   * Gets the service invalidator.
   */
  protected abstract getServiceInvalidator(): ServiceInvalidator

  /**
   * Gets an instance from the container.
   */
  // #1 Simple class
  abstract get<T extends ClassType>(
    token: T,
  ): InstanceType<T> extends Factorable<infer R>
    ? Promise<R>
    : Promise<InstanceType<T>>
  // #1.1 Simple class with args
  abstract get<T extends ClassTypeWithArgument<R>, R>(
    token: T,
    args: R,
  ): Promise<InstanceType<T>>
  // #2 Token with required Schema
  abstract get<T, S extends InjectionTokenSchemaType>(
    token: InjectionToken<T, S>,
    args: z.input<S>,
  ): Promise<T>
  // #3 Token with optional Schema
  abstract get<T, S extends InjectionTokenSchemaType, R extends boolean>(
    token: InjectionToken<T, S, R>,
  ): R extends false
    ? Promise<T>
    : S extends ZodType<infer Type>
      ? `Error: Your token requires args: ${Join<
          UnionToArray<keyof Type>,
          ', '
        >}`
      : 'Error: Your token requires args'
  // #4 Token with no Schema
  abstract get<T>(token: InjectionToken<T, undefined>): Promise<T>
  abstract get<T>(token: BoundInjectionToken<T, any>): Promise<T>
  abstract get<T>(token: FactoryInjectionToken<T, any>): Promise<T>

  /**
   * Invalidates a service and its dependencies.
   */
  abstract invalidate(service: unknown): Promise<void>

  /**
   * Disposes the container and cleans up all resources.
   */
  abstract dispose(): Promise<void>

  // ============================================================================
  // SHARED IMPLEMENTATIONS
  // ============================================================================

  /**
   * Calculates the instance name for a given token and optional arguments.
   *
   * @internal
   * @param token The class type, InjectionToken, BoundInjectionToken, or FactoryInjectionToken
   * @param args Optional arguments (ignored for BoundInjectionToken which uses its bound value)
   * @returns The calculated instance name string, or null if the token is a FactoryInjectionToken that is not yet resolved
   */
  calculateInstanceName(
    token:
      | ClassType
      | InjectionToken<any, any>
      | BoundInjectionToken<any, any>
      | FactoryInjectionToken<any, any>,
    args?: unknown,
  ): string | null {
    const tokenResolver = this.getTokenResolver()

    // Use validateAndResolveTokenArgs to handle token normalization and arg resolution
    const [err, { actualToken, validatedArgs }] =
      tokenResolver.validateAndResolveTokenArgs(token, args)

    if (err) {
      // Return null if factory token is not resolved
      if (
        err instanceof DIError &&
        err.code === DIErrorCode.FactoryTokenNotResolved
      ) {
        return null
      }

      // Return null if validation fails (can't calculate name with invalid args)
      if (
        err instanceof DIError &&
        err.code === DIErrorCode.TokenValidationError
      ) {
        return null
      }
    }

    // Get the real token for registry lookup to determine scope
    const realToken = this.getTokenResolver().getRealToken(actualToken)

    const registry = this.getRegistry()

    // Get scope from registry, or use default scope if not registered
    const scope = registry.has(realToken)
      ? registry.get(realToken).scope
      : this.defaultScope

    // Generate instance name using the name resolver with actual token and validated args
    return this.getNameResolver().generateInstanceName(
      actualToken,
      validatedArgs,
      scope === InjectableScope.Request ? this.requestId : undefined,
      scope,
    )
  }

  /**
   * Checks if a service is registered in the container.
   */
  isRegistered(token: any): boolean {
    const realToken = this.getTokenResolver().getRegistryToken(token)
    return this.getRegistry().has(realToken)
  }

  /**
   * Waits for all pending operations to complete.
   */
  async ready(): Promise<void> {
    await this.getServiceInvalidator().readyWithStorage(this.getStorage())
  }

  /**
   * @internal
   * Attempts to get an instance synchronously if it already exists.
   */
  tryGetSync<T>(token: any, args?: any): T | null {
    return this.tryGetSyncFromStorage(
      token,
      args,
      this.getStorage(),
      this.requestId,
    )
  }

  /**
   * @internal
   * Internal method for getting instances synchronously with configurable storage.
   */
  protected tryGetSyncFromStorage<T>(
    token: any,
    args: any,
    storage: UnifiedStorage,
    requestId?: string,
  ): T | null {
    const tokenResolver = this.getTokenResolver()
    const realToken = tokenResolver.getRegistryToken(token)
    const registry = this.getRegistry()
    const scope = registry.has(realToken)
      ? registry.get(realToken).scope
      : InjectableScope.Singleton

    try {
      const instanceName = this.getNameResolver().generateInstanceName(
        tokenResolver.normalizeToken(token),
        args,
        requestId,
        scope,
      )

      const result = storage.get(instanceName)
      if (result && result[0] === undefined && result[1]) {
        const holder = result[1]
        if (holder.status === InstanceStatus.Created) {
          return holder.instance as T
        }
      }
    } catch {
      // Ignore error
    }

    return null
  }

  /**
   * Adds an instance to the container.
   * Accepts class types, InjectionTokens, and BoundInjectionTokens.
   * Rejects InjectionTokens with required schemas (use BoundInjectionToken instead).
   *
   * @param token The class type, InjectionToken, or BoundInjectionToken to register the instance for
   * @param instance The instance to store
   */
  addInstance<T>(
    token: ClassType | InjectionToken<T, any> | BoundInjectionToken<T, any>,
    instance: T,
  ): void {
    this.addInstanceToStorage(
      token,
      instance,
      this.getStorage(),
      this.defaultScope,
      this.requestId,
    )
  }

  /**
   * @internal
   * Internal method for adding instances with configurable scope and storage.
   */
  protected addInstanceToStorage<T>(
    token: ClassType | InjectionToken<T, any> | BoundInjectionToken<T, any>,
    instance: T,
    storage: UnifiedStorage,
    scope: InjectableScope,
    requestId?: string,
  ): void {
    // Check if token is an InjectionToken with required schema
    // BoundInjectionToken is allowed (it already has a value bound)
    if (token instanceof InjectionToken) {
      // Check if schema exists and is required (not optional)
      if (token.schema) {
        const schemaType = (token.schema as ZodType)?.def?.type
        if (schemaType !== 'optional') {
          throw DIError.tokenSchemaRequiredError(token.name)
        }
      }
    }

    const tokenResolver = this.getTokenResolver()
    const registry = this.getRegistry()

    // Normalize the token
    const normalizedToken = tokenResolver.normalizeToken(token)
    const realToken = tokenResolver.getRegistryToken(token)

    // If it's a class type and not registered, register it with the given scope
    if (typeof token === 'function' && !registry.has(realToken)) {
      registry.set(realToken, scope, token, InjectableType.Class)
    } else if (!registry.has(realToken)) {
      // Set a stub factory class to avoid errors when getting instances of unregistered factory tokens
      registry.set(
        realToken,
        scope,
        StubFactoryClass,
        InjectableType.Class,
        // Lowest priority to avoid conflicts with other registered tokens
        -1,
      )
    }

    // Generate instance name with the given scope
    const instanceName = this.getNameResolver().generateInstanceName(
      normalizedToken,
      normalizedToken instanceof BoundInjectionToken
        ? normalizedToken.value
        : undefined,
      requestId,
      scope,
    )

    // Store the instance
    storage.storeInstance(instanceName, instance)
  }
}
