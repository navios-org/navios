import type { ModuleMetadata } from '@navios/core'
import type { Serve, Server } from 'bun'

import { Logger } from '@navios/core'
import {
  Container,
  inject,
  Injectable,
  InjectableScope,
  InjectableType,
} from '@navios/di'

import type {
  BunApplicationOptions,
  BunApplicationServiceInterface,
} from '../interfaces/application.interface.mjs'
import type { BunRoutes } from './controller-adapter.service.mjs'

import { BunApplicationServiceToken, BunServerToken } from '../tokens/index.mjs'
import { BunControllerAdapterService } from './controller-adapter.service.mjs'

@Injectable({
  token: BunApplicationServiceToken,
})
export class BunApplicationService implements BunApplicationServiceInterface {
  private logger = inject(Logger, {
    context: BunApplicationService.name,
  })
  protected container = inject(Container)
  private server: Server<undefined> | null = null
  private controllerAdapter = inject(BunControllerAdapterService)
  private globalPrefix: string = ''
  private routes: BunRoutes = {}
  private serverOptions: Serve.Options<undefined, string> | null = null

  async setupHttpServer(options: BunApplicationOptions): Promise<void> {
    // Collect routes from modules
    // But modules are set in onModulesInit, so assume it's called before
    this.serverOptions = options
  }

  async initServer(): Promise<void> {
    // Register server instance
    const instanceName = this.container
      .getServiceLocator()
      .getInstanceIdentifier(BunServerToken)
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

  async ready(): Promise<void> {
    // Bun server is ready when created
  }

  setGlobalPrefix(prefix: string): void {
    this.globalPrefix = prefix
  }

  getServer(): Server<undefined> {
    if (!this.server) {
      throw new Error('Server is not initialized. Call createHttpServer first.')
    }
    return this.server
  }

  async onModulesInit(modules: Map<string, ModuleMetadata>): Promise<void> {
    for (const [_moduleName, moduleMetadata] of modules) {
      if (
        !moduleMetadata.controllers ||
        moduleMetadata.controllers.size === 0
      ) {
        continue
      }
      for (const controller of moduleMetadata.controllers) {
        await this.controllerAdapter.setupController(
          controller,
          this.routes,
          moduleMetadata,
          this.globalPrefix,
        )
      }
    }
  }

  private async handleRequest(): Promise<Response> {
    // This is a fallback if routes don't match
    return new Response('Not Found', { status: 404 })
  }

  enableCors(): void {
    // Ignore for now
  }

  enableMultipart(): void {
    // Ignore for now
  }

  async listen(options: any): Promise<string> {
    // Server is already listening
    const port = options.port || 3000
    const hostname = options.hostname || 'localhost'

    this.server = Bun.serve({
      ...this.serverOptions,
      routes: this.routes,
      port,
      hostname,
      fetch: this.handleRequest.bind(this),
    })
    this.initServer()
    this.logger.log(
      `Bun server listening on http://${hostname}:${port}`,
      'Bootstrap',
    )
    return `${hostname}:${port}`
  }

  async dispose(): Promise<void> {
    this.server?.stop()
  }
}
