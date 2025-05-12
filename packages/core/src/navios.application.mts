import type { FastifyCorsOptions } from '@fastify/cors'
import type { FastifyMultipartOptions } from '@fastify/multipart'
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
import type { LoggerService, LogLevel } from './logger/index.mjs'
import type { ClassTypeWithInstance } from './service-locator/index.mjs'

import { HttpException } from './exceptions/index.mjs'
import { Logger, PinoWrapper } from './logger/index.mjs'
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

export interface NaviosApplicationContextOptions {
  /**
   * Specifies the logger to use.  Pass `false` to turn off logging.
   */
  logger?: LoggerService | LogLevel[] | false
}

export interface NaviosApplicationOptions
  extends Omit<FastifyServerOptions, 'logger'>,
    NaviosApplicationContextOptions {}

@Injectable()
export class NaviosApplication {
  private moduleLoader = syncInject(ModuleLoaderService)
  private controllerAdapter = syncInject(ControllerAdapterService)
  private logger = syncInject(Logger, {
    context: NaviosApplication.name,
  })
  private server: FastifyInstance | null = null
  private corsOptions: FastifyCorsOptions | null = null
  private multipartOptions: FastifyMultipartOptions | true | null = null
  private globalPrefix: string | null = null

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

  async init() {
    if (!this.appModule) {
      throw new Error('App module is not set. Call setAppModule() first.')
    }
    await this.moduleLoader.loadModules(this.appModule)
    this.server = await this.getFastifyInstance(this.options)
    this.configureFastifyInstance(this.server)
    getServiceLocator().registerInstance(Application, this.server)
    // Add schema validator and serializer
    this.server.setValidatorCompiler(validatorCompiler)
    this.server.setSerializerCompiler(serializerCompiler)

    if (this.corsOptions) {
      await this.server.register(cors, this.corsOptions)
    }

    if (this.multipartOptions) {
      await this.configureMultipart(this.server, this.multipartOptions)
    }

    await this.initModules()
    await this.server.ready()

    this.isInitialized = true
    this.logger.debug('Navios application initialized')
  }

  private async getFastifyInstance(rawOptions: NaviosApplicationOptions) {
    const { logger, ...options } = rawOptions
    if (logger) {
      const fastifyOptions = options as FastifyServerOptions
      if (typeof logger === 'boolean') {
        if (!logger) {
          fastifyOptions.logger = false
        }
      } else {
        fastifyOptions.loggerInstance = new PinoWrapper(
          await inject(Logger, {
            context: 'FastifyAdapter',
          }),
        )
      }
      return fastify(fastifyOptions)
    } else {
      return fastify({
        ...options,
        loggerInstance: new PinoWrapper(
          await inject(Logger, {
            context: 'FastifyAdapter',
          }),
        ),
      } as FastifyServerOptions)
    }
  }

  private configureFastifyInstance(fastifyInstance: FastifyInstance) {
    fastifyInstance.setErrorHandler((error, request, reply) => {
      if (error instanceof HttpException) {
        return reply.status(error.statusCode).send(error.response)
      } else {
        const statusCode = error.statusCode || 500
        const message = error.message || 'Internal Server Error'
        const response = {
          statusCode,
          message,
          error: error.name || 'InternalServerError',
        }
        this.logger.error(
          `Error occurred: ${error.message} on ${request.url}`,
          error,
        )
        return reply.status(statusCode).send(response)
      }
    })

    fastifyInstance.setNotFoundHandler((req, reply) => {
      const response = {
        statusCode: 404,
        message: 'Not Found',
        error: 'NotFound',
      }
      this.logger.error(`Route not found: ${req.url}`)
      return reply.status(404).send(response)
    })
  }

  async configureMultipart(
    server: FastifyInstance,
    options: FastifyMultipartOptions | true,
  ): Promise<void> {
    if (options) {
      try {
        const multipartModule = await import('@fastify/multipart')
        await server.register(
          multipartModule.default,
          typeof options === 'object' ? options : {},
        )
      } catch (error) {
        this.logger.error(
          `@fastify/multipart is not installed. Please install it.`,
        )
        throw error
      }
    }
  }

  private async initModules() {
    const modules = this.moduleLoader.getAllModules()
    const promises: PromiseLike<any>[] = []
    for (const [moduleName, moduleMetadata] of modules) {
      if (
        !moduleMetadata.controllers ||
        moduleMetadata.controllers.size === 0
      ) {
        continue
      }
      promises.push(
        this.server!.register(
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
            prefix: this.globalPrefix ?? '',
          },
        ),
      )
    }

    await Promise.all(promises)
  }

  enableCors(options: FastifyCorsOptions) {
    this.corsOptions = options
  }

  enableMultipart(options: FastifyMultipartOptions) {
    this.multipartOptions = options
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
    const res = await this.server.listen(options)
    this.logger.debug(`Navios is listening on ${res}`)
  }

  async dispose() {
    if (this.server) {
      await this.server.close()
      this.server = null
    }
    if (this.moduleLoader) {
      this.moduleLoader.dispose()
    }
  }

  async close() {
    await this.dispose()
  }
}
