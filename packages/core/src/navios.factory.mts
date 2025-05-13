import type { ClassTypeWithInstance } from '@navios/di'

import { inject } from '@navios/di'

import type { NaviosModule } from './interfaces/index.mjs'
import type {
  NaviosApplicationContextOptions,
  NaviosApplicationOptions,
} from './navios.application.mjs'

import { isNil, LoggerInstance } from './logger/index.mjs'
import { NaviosApplication } from './navios.application.mjs'

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
