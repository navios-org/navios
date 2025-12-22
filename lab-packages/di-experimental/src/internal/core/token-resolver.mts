import type {
  AnyInjectableType,
  InjectionTokenType,
} from '../../token/injection-token.mjs'

import { DIError } from '../../errors/index.mjs'
import {
  BoundInjectionToken,
  FactoryInjectionToken,
  InjectionToken,
} from '../../token/injection-token.mjs'
import { getInjectableToken } from '../../utils/index.mjs'

/**
 * Handles token validation and resolution.
 *
 * Focuses on token validation, normalization, and argument validation.
 * Name generation is handled by NameResolver.
 */
export class TokenResolver {
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
   *
   * @param token The token to validate
   * @param args Optional arguments
   * @returns [error, { actualToken, validatedArgs }]
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
        `[TokenResolver]#validateAndResolveTokenArgs(): Error validating args for ${actualToken.name.toString()}`,
        validatedArgs.error,
      )
      return [
        DIError.tokenValidationError(
          `Validation failed for ${actualToken.name.toString()}`,
          actualToken.schema,
          realArgs,
        ),
        { actualToken },
      ]
    }
    return [undefined, { actualToken, validatedArgs: validatedArgs?.data }]
  }
}
