import type { ClassTypeWithInstance } from '@navios/di'

import { Container, inject, Injectable } from '@navios/di'

import type {
  AbstractHttpListenOptions,
  NaviosModule,
} from './interfaces/index.mjs'
import type { LoggerService, LogLevel } from './logger/index.mjs'

import { HttpAdapterToken } from './index.mjs'
import { Logger } from './logger/index.mjs'
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
  private moduleLoader = inject(ModuleLoaderService)
  private httpApplication = inject(HttpAdapterToken)
  private logger = inject(Logger, {
    context: NaviosApplication.name,
  })
  protected container = inject(Container)

  private appModule: ClassTypeWithInstance<NaviosModule> | null = null
  private options: NaviosApplicationOptions = {}

  isInitialized = false

  setup(
    appModule: ClassTypeWithInstance<NaviosModule>,
    options: NaviosApplicationOptions = {},
  ) {
    this.appModule = appModule
    this.options = options
  }

  getContainer() {
    return this.container
  }

  async init() {
    if (!this.appModule) {
      throw new Error('App module is not set. Call setAppModule() first.')
    }
    await this.moduleLoader.loadModules(this.appModule)
    await this.httpApplication.createHttpServer(this.options)
    await this.httpApplication.initServer()
    await this.initModules()
    await this.httpApplication.ready()

    this.isInitialized = true
    this.logger.debug('Navios application initialized')
  }

  private async initModules() {
    const modules = this.moduleLoader.getAllModules()
    await this.httpApplication.onModulesInit(modules)
  }

  enableCors(options: any) {
    this.httpApplication.enableCors(options)
  }

  enableMultipart(options: any) {
    this.httpApplication.enableMultipart(options)
  }

  setGlobalPrefix(prefix: string) {
    this.httpApplication.setGlobalPrefix(prefix)
  }

  getServer() {
    return this.httpApplication.getServer()
  }

  async listen(options: AbstractHttpListenOptions) {
    await this.httpApplication.listen(options)
  }

  async dispose() {
    await this.httpApplication.dispose()
    if (this.moduleLoader) {
      this.moduleLoader.dispose()
    }
  }

  async close() {
    await this.dispose()
  }
}
