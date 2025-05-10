import type { NaviosModule } from './interfaces/index.mjs'
import type {
  NaviosApplicationContextOptions,
  NaviosApplicationOptions,
} from './navios.application.mjs'
import type { ClassTypeWithInstance } from './service-locator/index.mjs'

import { isNil, LoggerInstance } from './logger/index.mjs'
import { NaviosApplication } from './navios.application.mjs'
import { inject } from './service-locator/index.mjs'

export class NaviosFactory {
  static async create(
    appModule: ClassTypeWithInstance<NaviosModule>,
    options: NaviosApplicationOptions = {},
  ) {
    const app = await inject(NaviosApplication)
    this.registerLoggerConfiguration(options)
    app.setup(appModule, options)
    return app
  }

  private static registerLoggerConfiguration(
    options: NaviosApplicationContextOptions,
  ) {
    if (!options) {
      return
    }
    const { logger } = options
    if ((logger as boolean) !== true && !isNil(logger)) {
      LoggerInstance.overrideLogger(logger)
    }
  }
}
