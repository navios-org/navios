import type { ClassTypeWithInstance } from '@navios/di'

import { Container } from '@navios/di'

import type { NaviosModule } from './interfaces/index.mjs'
import type {
  NaviosApplicationContextOptions,
  NaviosApplicationOptions,
} from './navios.application.mjs'

import { isNil } from './logger/index.mjs'
import { NaviosApplication } from './navios.application.mjs'

export class NaviosFactory {
  static async create(
    appModule: ClassTypeWithInstance<NaviosModule>,
    options: NaviosApplicationOptions = {},
  ) {
    const container = new Container()
    const app = await container.get(NaviosApplication)
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
      // LoggerInstance.staticInstanceRef = logger
    }
  }
}
