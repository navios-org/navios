import type { FastifyCorsOptions } from '@fastify/cors'
import type {
  FastifyInstance,
  FastifyListenOptions,
  FastifyServerOptions,
} from 'fastify'

import cors from '@fastify/cors'
import { fastify } from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod'

import type { NaviosModule } from './interfaces/index.mjs'
import type { ClassTypeWithInstance } from './service-locator/index.mjs'

import {
  getServiceLocator,
  inject,
  Injectable,
  syncInject,
} from './service-locator/index.mjs'
import {
  ControllerAdapterService,
  ModuleLoaderService,
} from './services/index.mjs'
import { Application } from './tokens/index.mjs'

export interface NaviosApplicationOptions extends FastifyServerOptions {}

@Injectable()
export class NaviosApplication {
  private moduleLoader = syncInject(ModuleLoaderService)
  private controllerAdapter = syncInject(ControllerAdapterService)
  private server: FastifyInstance | null = null
  private corsOptions: FastifyCorsOptions | null = null
  private globalPrefix: string | null = null

  private appModule: ClassTypeWithInstance<NaviosModule> | null = null
  private options: NaviosApplicationOptions = {}

  setup(
    appModule: ClassTypeWithInstance<NaviosModule>,
    options: NaviosApplicationOptions = {},
  ) {
    this.appModule = appModule
    this.options = options
  }

  async init() {
    if (!this.appModule) {
      throw new Error('App module is not set. Call setAppModule() first.')
    }
    await this.moduleLoader.loadModules(this.appModule)
    this.server = fastify(this.options)
    getServiceLocator().registerInstance(Application, this.server)
    // Add schema validator and serializer
    this.server.setValidatorCompiler(validatorCompiler)
    this.server.setSerializerCompiler(serializerCompiler)

    if (this.corsOptions) {
      await this.server.register(cors, this.corsOptions)
    }
    const modules = this.moduleLoader.getAllModules()
    const globalPrefix = this.globalPrefix ?? ''
    for (const [moduleName, moduleMetadata] of modules) {
      if (
        !moduleMetadata.controllers ||
        moduleMetadata.controllers.size === 0
      ) {
        continue
      }
      this.server.register(
        (instance, opts, done) => {
          for (const controller of moduleMetadata.controllers) {
            this.controllerAdapter.setupController(
              controller,
              instance,
              moduleMetadata,
            )
          }
          done()
        },
        {
          prefix: globalPrefix,
        },
      )
    }
  }

  enableCors(options: FastifyCorsOptions) {
    this.corsOptions = options
    this.server?.register
  }

  setGlobalPrefix(prefix: string) {
    this.globalPrefix = prefix
  }

  getServer(): FastifyInstance {
    if (!this.server) {
      throw new Error('Server is not initialized. Call init() first.')
    }
    return this.server
  }

  async listen(options: FastifyListenOptions) {
    if (!this.server) {
      throw new Error('Server is not initialized. Call init() first.')
    }
    await this.server.listen(options)
  }
}
