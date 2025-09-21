/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-empty-object-type */

import type { FactoryContext } from './factory-context.mjs'
import type {
  AnyInjectableType,
  InjectionTokenType,
} from './injection-token.mjs'
import type { RequestContextHolder } from './request-context-holder.mjs'
import type { ServiceLocator } from './service-locator.mjs'

import { FactoryTokenNotResolved, UnknownError } from './errors/index.mjs'
import {
  BoundInjectionToken,
  FactoryInjectionToken,
  InjectionToken,
} from './injection-token.mjs'
import { getInjectableToken } from './utils/index.mjs'

/**
 * TokenProcessor handles token validation, resolution, and instance name generation.
 * Extracted from ServiceLocator to improve separation of concerns.
 */
export class TokenProcessor {
  constructor(private readonly logger: Console | null = null) {}

  /**
   * Validates and resolves token arguments, handling factory token resolution and validation.
   */
  validateAndResolveTokenArgs(
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
        `[TokenProcessor]#validateAndResolveTokenArgs(): Error validating args for ${actualToken.name.toString()}`,
        validatedArgs.error,
      )
      return [new UnknownError(validatedArgs.error), { actualToken }]
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
   * @param contextHolder Optional request context holder for priority-based resolution
   * @param serviceLocator Reference to the service locator for dependency resolution
   */
  createFactoryContext(
    contextHolder: RequestContextHolder | undefined,
    serviceLocator: ServiceLocator, // ServiceLocator reference for dependency resolution
  ): FactoryContext & {
    getDestroyListeners: () => (() => void)[]
    deps: Set<string>
  } {
    const destroyListeners = new Set<() => void>()
    const deps = new Set<string>()
    const tokenProcessor = this

    function addDestroyListener(listener: () => void) {
      destroyListeners.add(listener)
    }

    function getDestroyListeners() {
      return Array.from(destroyListeners)
    }

    return {
      // @ts-expect-error This is correct type
      async inject(token, args) {
        const instanceName = tokenProcessor.generateInstanceName(token, args)

        // Check request contexts for pre-prepared instances
        const prePreparedInstance = tokenProcessor.tryGetPrePreparedInstance(
          instanceName,
          contextHolder,
          deps,
          serviceLocator.getRequestContextManager().getCurrentRequestContext(),
        )
        if (prePreparedInstance !== undefined) {
          return prePreparedInstance
        }

        // Fall back to normal resolution
        const [error, instance] = await serviceLocator.getInstance(
          token,
          args,
          ({ instanceName }: { instanceName: string }) => {
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
      locator: serviceLocator,
      deps,
    }
  }

  /**
   * Tries to get a pre-prepared instance from request contexts.
   */
  tryGetPrePreparedInstance(
    instanceName: string,
    contextHolder: RequestContextHolder | undefined,
    deps: Set<string>,
    currentRequestContext: RequestContextHolder | null,
  ): any {
    // Check provided context holder first (if has higher priority)
    if (contextHolder && contextHolder.priority > 0) {
      const prePreparedInstance = contextHolder.get(instanceName)?.instance
      if (prePreparedInstance !== undefined) {
        this.logger?.debug(
          `[TokenProcessor] Using pre-prepared instance ${instanceName} from request context ${contextHolder.requestId}`,
        )
        deps.add(instanceName)
        return prePreparedInstance
      }
    }

    // Check current request context (if different from provided contextHolder)
    if (currentRequestContext && currentRequestContext !== contextHolder) {
      const prePreparedInstance =
        currentRequestContext.get(instanceName)?.instance
      if (prePreparedInstance !== undefined) {
        this.logger?.debug(
          `[TokenProcessor] Using pre-prepared instance ${instanceName} from current request context ${currentRequestContext.requestId}`,
        )
        deps.add(instanceName)
        return prePreparedInstance
      }
    }

    return undefined
  }
}
