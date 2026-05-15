import { JwtServiceToken } from './jwt.service.mjs'
import { JwtServiceOptionsSchema } from './options/jwt-service.options.mjs'

import type { BoundToken, FactoryToken } from '@navios/di'
import type { JwtService } from './jwt.service.mjs'
import type { JwtServiceOptions } from './options/jwt-service.options.mjs'

/**
 * Creates a JWT service provider for dependency injection.
 *
 * This function creates an injection token that can be used to register and resolve
 * `JwtService` instances in the Navios dependency injection container. It supports
 * both static configuration and async factory functions for dynamic configuration.
 *
 * @param config - Static JWT service configuration options
 * @returns A bound injection token that can be used with `@Inject` or `@InjectLazy`
 *
 * @example
 * ```ts
 * import { Inject } from '@navios/di'
 *
 * // Static configuration
 * const JwtService = provideJwtService({
 *   secret: 'your-secret-key',
 *   signOptions: { expiresIn: '1h' },
 * })
 *
 * @Injectable()
 * class AuthService {
 *   @Inject(JwtService) accessor jwtService!: JwtService
 * }
 * ```
 */
export function provideJwtService(
  config: JwtServiceOptions,
): BoundToken<JwtService, typeof JwtServiceOptionsSchema>
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
 *   const configService = await ctx.resolve(ConfigService)
 *   return {
 *     secret: configService.jwt.secret,
 *     signOptions: { expiresIn: configService.jwt.expiresIn },
 *   }
 * })
 *
 * @Injectable()
 * class AuthService {
 *   @Inject(JwtService) accessor jwtService!: JwtService
 * }
 * ```
 */
export function provideJwtService(
  config: () => Promise<JwtServiceOptions>,
): FactoryToken<JwtService, typeof JwtServiceOptionsSchema>
export function provideJwtService(
  config: JwtServiceOptions | (() => Promise<JwtServiceOptions>),
):
  | BoundToken<JwtService, typeof JwtServiceOptionsSchema>
  | FactoryToken<JwtService, typeof JwtServiceOptionsSchema> {
  if (typeof config === 'function') {
    return JwtServiceToken.fromFactory(config)
  }
  return JwtServiceToken.bind(config)
}
