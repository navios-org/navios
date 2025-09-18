import type { ClassTypeWithInstance } from '@navios/di'

import { Container, InjectableScope, InjectableType } from '@navios/di'

import type { NaviosModule } from './interfaces/index.mjs'
import type {
  NaviosApplicationContextOptions,
  NaviosApplicationOptions,
} from './navios.application.mjs'

import { ConsoleLogger, isNil, LoggerOutput } from './logger/index.mjs'
import { NaviosApplication } from './navios.application.mjs'

export class NaviosFactory {
  static async create(
    appModule: ClassTypeWithInstance<NaviosModule>,
    options: NaviosApplicationOptions = {},
  ) {
    const container = new Container()
    await this.registerLoggerConfiguration(container, options)
    const app = await container.get(NaviosApplication)
    app.setup(appModule, options)
    return app
  }

  private static async registerLoggerConfiguration(
    container: Container,
    options: NaviosApplicationContextOptions,
  ) {
    const { logger } = options
    if (Array.isArray(logger) || isNil(logger)) {
      const loggerInstance = (await container.get(
        LoggerOutput,
      )) as ConsoleLogger
      loggerInstance?.setup({
        logLevels: logger,
      })
    }
    if ((logger as boolean) !== true && !isNil(logger)) {
      container
        .getServiceLocator()
        .getManager()
        .storeCreatedHolder(
          LoggerOutput.toString(),
          logger,
          InjectableType.Class,
          InjectableScope.Singleton,
        )
    }
  }
}
