import type { NaviosApplicationOptions } from './navios.application.mjs'
import type { ClassTypeWithInstance } from './service-locator/index.mjs'
import type { ModuleInstance } from './services/index.mjs'

import { NaviosApplication } from './navios.application.mjs'
import { inject } from './service-locator/index.mjs'

export class NaviosFactory {
  static async create(
    appModule: ClassTypeWithInstance<ModuleInstance>,
    options: NaviosApplicationOptions = {},
  ) {
    const app = await inject(NaviosApplication)
    app.setup(appModule, options)
    return app
  }
}
