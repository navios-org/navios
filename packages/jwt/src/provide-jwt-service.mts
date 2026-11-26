import { InjectionToken, registerFactory } from '@navios/core'

import type { FactoryContext } from '@navios/core'

import { isPromiseLike } from './internal/promise-like.mjs'
import { JwtService } from './jwt-service.mjs'

import type { JwtServiceOptions } from './jwt-service-options.mjs'

export interface ProvideJwtServiceOptions {
  /** The name of the token, shown in error messages. `JwtService` by default. */
  name?: string | undefined
}

/**
 * Creates an injection token with a configured `JwtService` behind it.
 *
 * Every call returns a token of its own, with its own service: an application with access and
 * refresh tokens has two, and each can be replaced with `provide()`. Call it once per service,
 * at module level. Tenants or rotated keys are not services; use `keys`, or pass the key to
 * the call.
 *
 * The service is created and its configuration checked when it is first resolved. Pass a
 * function when the configuration comes from another service, such as a configuration service
 * or a secret store. It receives a `FactoryContext`; resolve dependencies with `ctx.inject()`.
 * It runs once per container, the first time the service is resolved.
 *
 * @param config - JWT service configuration, or a function (sync or async) that returns it
 * @param options - The name of the token
 * @returns A token that can be used with `inject()` or `asyncInject()`
 *
 * @example
 * ```ts
 * // Static configuration
 * const Jwt = provideJwtService({
 *   secret: process.env.JWT_SECRET,
 *   signOptions: { expiresIn: '1h' },
 * })
 *
 * // Configuration from another service
 * const RefreshJwt = provideJwtService(
 *   async (ctx) => {
 *     const config = await ctx.inject(ConfigService)
 *     return { secret: config.jwt.refreshSecret, signOptions: { expiresIn: '30d' } }
 *   },
 *   { name: 'RefreshJwt' },
 * )
 *
 * @Injectable()
 * class AuthService {
 *   private readonly jwt = inject(Jwt)
 *   private readonly refreshJwt = inject(RefreshJwt)
 * }
 * ```
 */
export function provideJwtService(
  config:
    | JwtServiceOptions
    | ((ctx: FactoryContext) => Promise<JwtServiceOptions> | JwtServiceOptions),
  { name = 'JwtService' }: ProvideJwtServiceOptions = {},
): InjectionToken<JwtService, undefined> {
  const token = InjectionToken.create<JwtService>(name)

  class JwtServiceFactory {
    create(ctx: FactoryContext): JwtService | Promise<JwtService> {
      const options = typeof config === 'function' ? config(ctx) : config
      // `then` of a thenable that is not a promise may return nothing.
      return isPromiseLike(options)
        ? Promise.resolve(options).then((resolved) => new JwtService(resolved))
        : new JwtService(options)
    }
  }
  registerFactory(JwtServiceFactory, { token })

  return token
}
