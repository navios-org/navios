import type { ClassTypeWithInstance } from '@navios/di'

import { Container, inject, Injectable } from '@navios/di'

import type {
  AbstractHttpAdapterInterface,
  AbstractHttpListenOptions,
  NaviosModule,
} from './interfaces/index.mjs'
import type { LoggerService, LogLevel } from './logger/index.mjs'

import { HttpAdapterToken } from './index.mjs'
import { Logger } from './logger/index.mjs'
import { NaviosEnvironment } from './navios.environment.mjs'
import { ModuleLoaderService } from './services/index.mjs'

export interface NaviosApplicationContextOptions {
  /**
   * Specifies the logger to use.  Pass `false` to turn off logging.
   */
  logger?: LoggerService | LogLevel[] | false
}

export interface NaviosApplicationOptions
  extends NaviosApplicationContextOptions {
  // Fastify server options will be handled by FastifyApplicationService
  [key: string]: any
}

@Injectable()
export class NaviosApplication {
  private environment = inject(NaviosEnvironment)
  private moduleLoader = inject(ModuleLoaderService)
  private httpApplication: AbstractHttpAdapterInterface<any> | null = null
  private logger = inject(Logger, {
    context: NaviosApplication.name,
  })
  protected container = inject(Container)

  private appModule: ClassTypeWithInstance<NaviosModule> | null = null
  private options: NaviosApplicationOptions = {}

  isInitialized = false

  async setup(
    appModule: ClassTypeWithInstance<NaviosModule>,
    options: NaviosApplicationOptions = {},
  ) {
    this.appModule = appModule
    this.options = options
    if (this.environment.hasHttpSetup()) {
      this.httpApplication = await this.container.get(HttpAdapterToken)
    }
  }

  getContainer() {
    return this.container
  }

  async init() {
    if (!this.appModule) {
      throw new Error('App module is not set. Call setAppModule() first.')
    }
    await this.moduleLoader.loadModules(this.appModule)
    if (this.environment.hasHttpSetup()) {
      await this.httpApplication?.setupHttpServer(this.options)
    }
    await this.initModules()
    if (this.environment.hasHttpSetup()) {
      await this.httpApplication?.ready()
    }

    this.isInitialized = true
    this.logger.debug('Navios application initialized')
  }

  private async initModules() {
    const modules = this.moduleLoader.getAllModules()
    await this.httpApplication?.onModulesInit(modules)
  }

  enableCors(options: any) {
    if (!this.httpApplication) {
      throw new Error('HTTP application is not set')
    }
    this.httpApplication.enableCors(options)
  }

  enableMultipart(options: any) {
    if (!this.httpApplication) {
      throw new Error('HTTP application is not set')
    }
    this.httpApplication.enableMultipart(options)
  }

  setGlobalPrefix(prefix: string) {
    if (!this.httpApplication) {
      throw new Error('HTTP application is not set')
    }
    this.httpApplication.setGlobalPrefix(prefix)
  }

  getServer() {
    if (!this.httpApplication) {
      throw new Error('HTTP application is not set')
    }
    return this.httpApplication.getServer()
  }

  async listen(options: AbstractHttpListenOptions) {
    if (!this.httpApplication) {
      throw new Error('HTTP application is not set')
    }
    await this.httpApplication.listen(options)
  }

  async dispose() {
    if (this.httpApplication) {
      await this.httpApplication.dispose()
    }
    if (this.moduleLoader) {
      this.moduleLoader.dispose()
    }
  }

  async close() {
    await this.dispose()
  }
}
