import type {
  AnyInjectableType,
  ClassTypeWithInstance,
  InjectionToken,
} from '@navios/di'

import { Container, InjectableScope, InjectableType } from '@navios/di'

import type { NaviosModule } from './interfaces/index.mjs'
import type {
  NaviosApplicationContextOptions,
  NaviosApplicationOptions,
} from './navios.application.mjs'

import { ConsoleLogger, isNil, LoggerOutput } from './logger/index.mjs'
import { NaviosApplication } from './navios.application.mjs'
import { NaviosEnvironment } from './navios.environment.mjs'

export class NaviosFactory {
  static async create(
    appModule: ClassTypeWithInstance<NaviosModule>,
    options: NaviosApplicationOptions = {
      adapter: [],
    },
  ) {
    const container = new Container()
    await this.registerLoggerConfiguration(container, options)
    const adapters = Array.isArray(options.adapter)
      ? options.adapter
      : [options.adapter]
    for (const adapter of adapters) {
      await this.registerEnvironment(container, adapter)
    }
    const app = await container.get(NaviosApplication)
    await app.setup(appModule, options)
    return app
  }

  private static async registerEnvironment(
    container: Container,
    environment: {
      httpTokens?: Map<InjectionToken<any, undefined>, AnyInjectableType>
    } = {},
  ) {
    const naviosEnvironment = await container.get(NaviosEnvironment)
    const { httpTokens } = environment
    if (httpTokens) {
      naviosEnvironment.setupHttpEnvironment(httpTokens)
    }
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
