import type {
  ControllerMetadata,
  HandlerMetadata,
  ModuleMetadata,
} from '@navios/core'
import type { ClassType, RequestContextHolder } from '@navios/di'
import type { BunRequest } from 'bun'

import {
  ExecutionContext,
  extractControllerMetadata,
  GuardRunnerService,
  HttpException,
  Logger,
} from '@navios/core'
import { Container, inject, Injectable, InjectionToken } from '@navios/di'

import type { BunHandlerAdapterInterface } from '../adapters/index.mjs'

import { BunExecutionContext } from '../interfaces/index.mjs'
import { BunRequestToken } from '../tokens/index.mjs'

export type BunRoutes = Record<
  string,
  { [method: string]: (req: BunRequest) => Response | Promise<Response> }
>

@Injectable()
export class BunControllerAdapterService {
  private guardRunner = inject(GuardRunnerService)
  private container = inject(Container)
  private logger = inject(Logger, {
    context: BunControllerAdapterService.name,
  })

  async setupController(
    controller: ClassType,
    routes: BunRoutes,
    moduleMetadata: ModuleMetadata,
    globalPrefix: string,
  ) {
    const controllerMetadata = extractControllerMetadata(controller)
    for (const endpoint of controllerMetadata.endpoints) {
      const { classMethod, url, httpMethod, adapterToken } = endpoint

      if (!url || !adapterToken) {
        throw new Error(
          `[Navios] Malformed Endpoint ${controller.name}:${classMethod}`,
        )
      }
      const adapter = await this.container.get(
        adapterToken as InjectionToken<BunHandlerAdapterInterface>,
      )
      const fullUrl = globalPrefix + url.replaceAll('$', ':')
      if (!routes[fullUrl]) {
        routes[fullUrl] = {}
      }
      routes[fullUrl][httpMethod] = this.wrapHandler(
        adapter.provideHandler(controller, endpoint),
        moduleMetadata,
        controllerMetadata,
        endpoint,
      )

      this.logger.debug(
        `Registered ${httpMethod} ${fullUrl} for ${controller.name}:${classMethod}`,
      )
    }
  }

  private wrapHandler(
    handler: (
      context: RequestContextHolder,
      request: BunRequest,
    ) => Promise<Response>,
    moduleMetadata: ModuleMetadata,
    controllerMetadata: ControllerMetadata,
    endpoint: HandlerMetadata,
  ) {
    return async (request: BunRequest) => {
      const executionContext = new BunExecutionContext(
        moduleMetadata,
        controllerMetadata,
        endpoint,
        request,
      )
      const requestId = crypto.randomUUID()
      const requestContext = this.container.beginRequest(requestId)
      requestContext.addInstance(BunRequestToken, request)
      requestContext.addInstance(ExecutionContext, executionContext)

      try {
        // Run guards
        const guards = this.guardRunner.makeContext(
          moduleMetadata,
          controllerMetadata,
          endpoint,
        )
        if (guards.size > 0) {
          const canActivate = await this.guardRunner.runGuards(
            guards,
            executionContext,
          )
          if (!canActivate) {
            return new Response('Forbidden', { status: 403 })
          }
        }

        const response = await handler(requestContext, request)
        return response
      } catch (error) {
        // Handle errors
        if (error instanceof HttpException) {
          return new Response(JSON.stringify(error.response), {
            status: error.statusCode,
            headers: { 'Content-Type': 'application/json' },
          })
        } else {
          const err = error as Error
          this.logger.error(`Error: ${err.message}`, err)
          return new Response(
            JSON.stringify({
              statusCode: 500,
              message: err.message || 'Internal Server Error',
              error: 'InternalServerError',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
      } finally {
        this.container.endRequest(requestId).catch((err) => {
          this.logger.error(
            `Error ending request context ${requestId}: ${err.message}`,
            err,
          )
        })
      }
    }
  }
}
