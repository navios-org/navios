import { InjectionToken, registerFactory } from '@navios/server'
import { betterAuth } from 'better-auth'

import type { FactoryContext } from '@navios/server'
import type { Auth, BetterAuthOptions } from 'better-auth'

export interface ProvideBetterAuthOptions {
  /** The name of the token, shown in error messages. `BetterAuth` by default. */
  name?: string | undefined
}

/** The configuration `provideBetterAuth` takes: options, or a function that returns them. */
export type BetterAuthConfig<Options extends BetterAuthOptions> =
  | Options
  | ((ctx: FactoryContext) => Options | Promise<Options>)

/**
 * Creates an injection token with a Better Auth instance behind it. The options are passed to
 * `betterAuth()` as they are.
 *
 * Pass a function when the options need other services, such as the database connection or a
 * mailer. It receives a `FactoryContext`; resolve dependencies with `ctx.inject()`. It runs once
 * per container, the first time the instance is resolved.
 *
 * Every call returns a token of its own. Call it once, at module level, and give the token to
 * `betterAuthPlugin()` and to `authForCli()`.
 *
 * @example
 * ```ts
 * export const Auth = provideBetterAuth(async (ctx) => {
 *   const db = await ctx.inject(Database)
 *   return { database: db.connection, emailAndPassword: { enabled: true } }
 * })
 *
 * @Injectable()
 * class AccountService {
 *   private readonly auth = inject(Auth)
 * }
 * ```
 */
export function provideBetterAuth<Options extends BetterAuthOptions>(
  config: BetterAuthConfig<Options>,
  { name = 'BetterAuth' }: ProvideBetterAuthOptions = {},
): InjectionToken<Auth<Options>, undefined> {
  const token = InjectionToken.create<Auth<Options>>(name)

  class BetterAuthFactory {
    async create(ctx: FactoryContext): Promise<Auth<Options>> {
      const options = typeof config === 'function' ? await config(ctx) : config
      return betterAuth(options)
    }
  }
  registerFactory(BetterAuthFactory, { token })

  return token
}
