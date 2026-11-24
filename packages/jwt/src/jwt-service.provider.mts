import { InjectionToken } from '@navios/core'

import type { BoundInjectionToken, FactoryContext, FactoryInjectionToken } from '@navios/core'

import { JwtService, JwtServiceToken } from './jwt.service.mjs'
import { JwtServiceOptionsSchema } from './options/jwt-service.options.mjs'

import type { JwtServiceOptions } from './options/jwt-service.options.mjs'

/**
 * Creates a JWT service provider for dependency injection.
 *
 * This function creates an injection token that can be used to register and resolve
 * `JwtService` instances in the Navios dependency injection container. It supports
 * both static configuration and async factory functions for dynamic configuration.
 *
 * @param config - Static JWT service configuration options
 * @returns A bound injection token that can be used with `inject()` or `asyncInject()`
 *
 * @example
 * ```ts
 * // Static configuration
 * const JwtService = provideJwtService({
 *   secret: 'your-secret-key',
 *   signOptions: { expiresIn: '1h' },
 * })
 *
 * @Injectable()
 * class AuthService {
 *   jwtService = inject(JwtService)
 * }
 * ```
 */
export function provideJwtService(
  config: JwtServiceOptions,
): BoundInjectionToken<JwtService, typeof JwtServiceOptionsSchema>
/**
 * Creates a JWT service provider with a configuration factory.
 *
 * Use this overload when the configuration comes from another service, such as
 * a configuration service or a secret store. The factory receives a
 * `FactoryContext`; resolve dependencies with `ctx.inject()`. It runs once per
 * container, the first time the service is resolved.
 *
 * @param config - Factory function (sync or async) that returns JWT service configuration
 * @returns A factory injection token that resolves the configuration lazily
 *
 * @example
 * ```ts
 * // Configuration from another service
 * const JwtService = provideJwtService(async (ctx) => {
 *   const configService = await ctx.inject(ConfigService)
 *   return {
 *     secret: configService.jwt.secret,
 *     signOptions: { expiresIn: configService.jwt.expiresIn },
 *   }
 * })
 *
 * @Injectable()
 * class AuthService {
 *   jwtService = inject(JwtService)
 * }
 * ```
 */
export function provideJwtService(
  config: (ctx: FactoryContext) => Promise<JwtServiceOptions> | JwtServiceOptions,
): FactoryInjectionToken<JwtService, typeof JwtServiceOptionsSchema>
export function provideJwtService(
  config:
    | JwtServiceOptions
    | ((ctx: FactoryContext) => Promise<JwtServiceOptions> | JwtServiceOptions),
):
  | BoundInjectionToken<JwtService, typeof JwtServiceOptionsSchema>
  | FactoryInjectionToken<JwtService, typeof JwtServiceOptionsSchema> {
  if (typeof config === 'function') {
    return InjectionToken.factory(JwtServiceToken, config)
  }
  return InjectionToken.bound(JwtServiceToken, config)
}
