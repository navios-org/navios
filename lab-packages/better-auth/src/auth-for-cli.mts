import { createApplication } from '@navios/server'

import type { ApplicationOptions, ClassType, InjectionToken } from '@navios/server'

export interface AuthForCliOptions {
  /** The root module of the application, so that its providers apply. */
  module: ClassType
  /** Providers over those of the modules, for example a database for migrations. */
  providers?: ApplicationOptions['providers']
  /**
   * Plugins to set up, for what they provide. A plugin that needs the HTTP transport, such as
   * `betterAuthPlugin`, does not belong here: the application has no transport.
   */
  plugins?: ApplicationOptions['plugins']
  /** The application's log. Off by default, so that only the CLI writes. */
  logger?: ApplicationOptions['logger']
}

/**
 * What the Better Auth CLI reads from its config file: a function that builds the application
 * without transports and resolves the instance from it. The CLI calls it and waits for it.
 *
 * ```ts title="auth.config.mts"
 * import { authForCli } from '@navios/better-auth'
 *
 * import { AppModule } from './src/app.module.mjs'
 * import { Auth } from './src/auth.mjs'
 *
 * export default authForCli(Auth, { module: AppModule })
 * ```
 *
 * The CLI has to run where the application's TypeScript and decorators load: with
 * `node --import tsx/esm` or `bun --bun`. Plain `npx auth` compiles decorators in the legacy
 * form and cannot load the application.
 *
 * The application is not closed: the CLI ends the process when it is done.
 */
export function authForCli<Instance>(
  auth: InjectionToken<Instance, undefined>,
  { module, providers, plugins, logger = false }: AuthForCliOptions,
): () => Promise<Instance> {
  return async () => {
    const app = createApplication(module, { providers, plugins, logger })
    await app.init()
    return app.get(auth)
  }
}
