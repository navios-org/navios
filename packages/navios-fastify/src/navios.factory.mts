import type { NaviosModule } from './interfaces/index.mjs'
import type { NaviosApplicationOptions } from './navios.application.mjs'
import type { ClassTypeWithInstance } from './service-locator/index.mjs'

import { NaviosApplication } from './navios.application.mjs'
import { inject } from './service-locator/index.mjs'

export class NaviosFactory {
  static async create(
    appModule: ClassTypeWithInstance<NaviosModule>,
    options: NaviosApplicationOptions = {},
  ) {
    const app = await inject(NaviosApplication)
    app.setup(appModule, options)
    return app
  }
}
