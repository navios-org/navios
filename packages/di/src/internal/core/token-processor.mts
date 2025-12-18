/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-empty-object-type */

import type { FactoryContext } from '../context/factory-context.mjs'
import type {
  AnyInjectableType,
  InjectionTokenType,
} from '../../token/injection-token.mjs'
import type { IContainer } from '../../interfaces/container.interface.mjs'

import { DIError } from '../../errors/index.mjs'
import {
  BoundInjectionToken,
  FactoryInjectionToken,
  InjectionToken,
} from '../../token/injection-token.mjs'
import { getInjectableToken } from '../../utils/index.mjs'

/**
 * Handles token validation, normalization, and instance name generation.
 *
 * Provides utilities for resolving tokens to their underlying InjectionToken,
 * validating arguments against schemas, and generating unique instance identifiers.
 */
export class TokenProcessor {
  constructor(private readonly logger: Console | null = null) {}

  // ============================================================================
  // TOKEN NORMALIZATION
  // ============================================================================

  /**
   * Normalizes a token to an InjectionToken.
   * Handles class constructors by getting their injectable token.
   *
   * @param token A class constructor, InjectionToken, BoundInjectionToken, or FactoryInjectionToken
   * @returns The normalized InjectionTokenType
   */
  normalizeToken(token: AnyInjectableType): InjectionTokenType {
    if (typeof token === 'function') {
      return getInjectableToken(token)
    }
    return token as InjectionTokenType
  }

  /**
   * Gets the underlying "real" token from wrapped tokens.
   * For BoundInjectionToken and FactoryInjectionToken, returns the wrapped token.
   * For other tokens, returns the token itself.
   *
   * @param token The token to unwrap
   * @returns The underlying InjectionToken
   */
  getRealToken<T = unknown>(token: InjectionTokenType): InjectionToken<T> {
    if (
      token instanceof BoundInjectionToken ||
      token instanceof FactoryInjectionToken
    ) {
      return token.token as InjectionToken<T>
    }
    return token as InjectionToken<T>
  }

  /**
   * Convenience method that normalizes a token and then gets the real token.
   * Useful for checking registry entries where you need the actual registered token.
   *
   * @param token Any injectable type
   * @returns The underlying InjectionToken
   */
  getRegistryToken<T = unknown>(token: AnyInjectableType): InjectionToken<T> {
    return this.getRealToken(this.normalizeToken(token))
  }

  // ============================================================================
  // TOKEN VALIDATION
  // ============================================================================

  /**
   * Validates and resolves token arguments, handling factory token resolution and validation.
   */
  validateAndResolveTokenArgs(
    token: AnyInjectableType,
    args?: any,
  ): [
    DIError | undefined,
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
        return [DIError.factoryTokenNotResolved(token.name), { actualToken }]
      }
    }
    if (!actualToken.schema) {
      return [undefined, { actualToken, validatedArgs: realArgs }]
    }
    const validatedArgs = actualToken.schema?.safeParse(realArgs)
    if (validatedArgs && !validatedArgs.success) {
      this.logger?.error(
        `[TokenProcessor]#validateAndResolveTokenArgs(): Error validating args for ${actualToken.name.toString()}`,
        validatedArgs.error,
      )
      return [DIError.unknown(validatedArgs.error), { actualToken }]
    }
    return [undefined, { actualToken, validatedArgs: validatedArgs?.data }]
  }

  /**
   * Generates a unique instance name based on token and arguments.
   */
  generateInstanceName(token: InjectionTokenType, args: any): string {
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
  formatArgValue(value: any): string {
    if (typeof value === 'function') {
      return `fn_${value.name}(${value.length})`
    }
    if (typeof value === 'symbol') {
      return value.toString()
    }
    return JSON.stringify(value).slice(0, 40)
  }

  /**
   * Creates a factory context for dependency injection during service instantiation.
   * @param container The container instance (Container or ScopedContainer) for dependency resolution
   * @param onDependencyResolved Callback when a dependency is resolved, receives the instance name
   */
  createFactoryContext(
    container: IContainer,
    onDependencyResolved?: (instanceName: string) => void,
  ): FactoryContext & {
    getDestroyListeners: () => (() => void)[]
    deps: Set<string>
  } {
    const destroyListeners = new Set<() => void>()
    const deps = new Set<string>()

    function addDestroyListener(listener: () => void) {
      destroyListeners.add(listener)
    }

    function getDestroyListeners() {
      return Array.from(destroyListeners)
    }

    const self = this

    return {
      // @ts-expect-error This is correct type
      async inject(token, args) {
        // Get the instance name for dependency tracking
        const actualToken =
          typeof token === 'function' ? getInjectableToken(token) : token
        const instanceName = self.generateInstanceName(actualToken, args)
        deps.add(instanceName)

        if (onDependencyResolved) {
          onDependencyResolved(instanceName)
        }

        // Use the container's get method for resolution
        return container.get(token, args)
      },
      addDestroyListener,
      getDestroyListeners,
      container,
      deps,
    }
  }
}
