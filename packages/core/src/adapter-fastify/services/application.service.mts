import type { FastifyCorsOptions } from '@fastify/cors'
import type { FastifyMultipartOptions } from '@fastify/multipart'
import type {
  FastifyInstance,
  FastifyListenOptions,
  FastifyServerOptions,
} from 'fastify'

import {
  Container,
  inject,
  Injectable,
  InjectableScope,
  InjectableType,
} from '@navios/di'

import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import { fastify } from 'fastify'
import {
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod'

import type { ModuleMetadata } from '../../index.mjs'
import type {
  FastifyApplicationOptions,
  FastifyApplicationServiceInterface,
} from '../interfaces/application.interface.mjs'

import { HttpException, Logger } from '../../index.mjs'
import { FastifyApplicationServiceToken } from '../tokens/index.mjs'
import { FastifyServerToken } from '../tokens/server.token.mjs'
import { FastifyControllerAdapterService } from './controller-adapter.service.mjs'
import { PinoWrapper } from './pino-wrapper.mjs'

@Injectable({
  token: FastifyApplicationServiceToken,
})
export class FastifyApplicationService
  implements FastifyApplicationServiceInterface
{
  private logger = inject(Logger, {
    context: FastifyApplicationService.name,
  })
  protected container = inject(Container)
  private server: FastifyInstance | null = null
  private controllerAdapter = inject(FastifyControllerAdapterService)
  private globalPrefix: string = ''

  private corsOptions: FastifyCorsOptions | null = null
  private multipartOptions: FastifyMultipartOptions | true | null = null

  async setupHttpServer(options: FastifyApplicationOptions): Promise<void> {
    const { logger, ...fastifyOptions } = options
    if (logger) {
      const serverOptions = fastifyOptions as FastifyServerOptions
      if (typeof logger === 'boolean') {
        if (!logger) {
          serverOptions.logger = false
        }
      } else {
        serverOptions.loggerInstance = await this.container.get(PinoWrapper)
      }
      this.server = fastify(serverOptions)
    } else {
      this.server = fastify({
        ...fastifyOptions,
        loggerInstance: await this.container.get(PinoWrapper),
      } as FastifyServerOptions)
    }
    await this.initServer()
  }

  async initServer(): Promise<void> {
    this.configureFastifyInstance()
    this.registerFastifyInstance()
    await this.configurePlugins()
  }

  async ready(): Promise<void> {
    await this.server!.ready()
  }

  setGlobalPrefix(prefix: string): void {
    this.globalPrefix = prefix
  }

  getServer(): FastifyInstance {
    if (!this.server) {
      throw new Error('Server is not initialized. Call init() first.')
    }
    return this.server
  }

  async onModulesInit(modules: Map<string, ModuleMetadata>): Promise<void> {
    const promises: PromiseLike<any>[] = []
    for (const [_moduleName, moduleMetadata] of modules) {
      if (
        !moduleMetadata.controllers ||
        moduleMetadata.controllers.size === 0
      ) {
        continue
      }
      promises.push(
        this.server!.register(
          async (instance, _opts) => {
            for (const controller of moduleMetadata.controllers) {
              await this.controllerAdapter.setupController(
                controller,
                instance,
                moduleMetadata,
              )
            }
          },
          {
            prefix: this.globalPrefix,
          },
        ),
      )
    }

    await Promise.all(promises)
  }

  configureFastifyInstance(): void {
    this.server!.setErrorHandler((error: any, request: any, reply: any) => {
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

    this.server!.setNotFoundHandler((req: any, reply: any) => {
      const response = {
        statusCode: 404,
        message: 'Not Found',
        error: 'NotFound',
      }
      this.logger.error(`Route not found: [${req.method}] ${req.url}`)
      return reply.status(404).send(response)
    })

    // Add schema validator and serializer
    this.server!.setValidatorCompiler(validatorCompiler)
    this.server!.setSerializerCompiler(serializerCompiler)
  }

  async configurePlugins(): Promise<void> {
    if (this.corsOptions) {
      await this.server!.register(cors, this.corsOptions)
    }

    if (this.multipartOptions) {
      await this.configureMultipart(this.multipartOptions)
    }
  }

  async configureMultipart(
    options: FastifyMultipartOptions | true,
  ): Promise<void> {
    if (options) {
      await this.server!.register(
        multipart,
        typeof options === 'object' ? options : {},
      )
    }
  }

  registerFastifyInstance(): void {
    const instanceName = this.container
      .getServiceLocator()
      .getInstanceIdentifier(FastifyServerToken)
    this.container
      .getServiceLocator()
      .getManager()
      .storeCreatedHolder(
        instanceName,
        this.server!,
        InjectableType.Class,
        InjectableScope.Singleton,
      )
  }

  enableCors(options: FastifyCorsOptions): void {
    this.corsOptions = options
  }

  enableMultipart(options: FastifyMultipartOptions): void {
    this.multipartOptions = options
  }

  async listen(options: FastifyListenOptions): Promise<string> {
    const res = await this.server!.listen(options)
    this.logger.debug(`Navios is listening on ${res}`)
    return res
  }

  async dispose(): Promise<void> {
    await this.server!.close()
  }
}
