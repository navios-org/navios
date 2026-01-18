import { InjectionToken } from '@navios/core'

import type { BoundInjectionToken, FactoryInjectionToken } from '@navios/core'

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
 * Creates a JWT service provider with async configuration factory.
 *
 * Use this overload when you need to load configuration asynchronously, such as
 * fetching secrets from a configuration service or environment variables.
 *
 * @param config - Async factory function that returns JWT service configuration
 * @returns A factory injection token that resolves configuration asynchronously
 *
 * @example
 * ```ts
 * // Async configuration
 * const JwtService = provideJwtService(async () => {
 *   const configService = await inject(ConfigService)
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
  config: () => Promise<JwtServiceOptions>,
): FactoryInjectionToken<JwtService, typeof JwtServiceOptionsSchema>
export function provideJwtService(
  config: JwtServiceOptions | (() => Promise<JwtServiceOptions>),
):
  | BoundInjectionToken<JwtService, typeof JwtServiceOptionsSchema>
  | FactoryInjectionToken<JwtService, typeof JwtServiceOptionsSchema> {
  if (typeof config === 'function') {
    return InjectionToken.factory(JwtServiceToken, config)
  }
  return InjectionToken.bound(JwtServiceToken, config)
}
