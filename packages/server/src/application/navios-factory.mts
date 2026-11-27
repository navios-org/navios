import type { ClassType } from '@navios/core'

import type { HttpAdapterEnvironment } from '../adapter/http-adapter.mjs'

import { NaviosApplication } from './navios-application.mjs'

import type { NaviosApplicationOptions } from './navios-application-options.mjs'

export class NaviosFactory {
  /**
   * Creates an application from its root module. Call `init()` (or
   * `listen()`, which initialises) to compile routes and start the adapter.
   *
   * ```ts
   * const app = await NaviosFactory.create(AppModule, {
   *   adapter: defineFastifyEnvironment(),
   * })
   * await app.listen({ port: 3000 })
   * ```
   */
  static async create<Env extends HttpAdapterEnvironment>(
    appModule: ClassType,
    options: NaviosApplicationOptions<Env>,
  ): Promise<NaviosApplication<Env>> {
    return new NaviosApplication<Env>(appModule, options)
  }
}
