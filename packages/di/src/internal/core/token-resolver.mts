import { DIError } from '../../errors/index.mjs'
import {
  BoundToken,
  FactoryToken,
  Token,
} from '../../token/token.mjs'
import { getInjectableToken } from '../../utils/index.mjs'

import type { AnyInjectableType, TokenType } from '../../token/token.mjs'

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
   * Normalizes a token to an Token.
   * Handles class constructors by getting their injectable token.
   *
   * @param token A class constructor, Token, BoundToken, or FactoryToken
   * @returns The normalized TokenType
   */
  normalizeToken(token: AnyInjectableType): TokenType {
    if (typeof token === 'function') {
      return getInjectableToken(token)
    }
    return token as TokenType
  }

  /**
   * Gets the underlying "real" token from wrapped tokens.
   * For BoundToken and FactoryToken, returns the wrapped token.
   * For other tokens, returns the token itself.
   *
   * @param token The token to unwrap
   * @returns The underlying Token
   */
  getRealToken<T = unknown>(token: TokenType): Token<T> {
    if (token instanceof BoundToken || token instanceof FactoryToken) {
      return token.token as Token<T>
    }
    return token as Token<T>
  }

  /**
   * Convenience method that normalizes a token and then gets the real token.
   * Useful for checking registry entries where you need the actual registered token.
   *
   * @param token Any injectable type
   * @returns The underlying Token
   */
  getRegistryToken<T = unknown>(token: AnyInjectableType): Token<T> {
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
  ): [DIError | undefined, { actualToken: TokenType; validatedArgs?: any }] {
    let actualToken = token as Token<any, any>
    if (typeof token === 'function') {
      actualToken = getInjectableToken(token)
    }
    let realArgs = args
    if (actualToken instanceof BoundToken) {
      realArgs = actualToken.value
    } else if (actualToken instanceof FactoryToken) {
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
