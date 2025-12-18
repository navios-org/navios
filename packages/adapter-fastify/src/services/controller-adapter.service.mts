import type {
  ClassType,
  ControllerMetadata,
  HandlerMetadata,
  ModuleMetadata,
  ScopedContainer,
} from '@navios/core'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'

import {
  Container,
  ExecutionContext,
  extractControllerMetadata,
  GuardRunnerService,
  HttpException,
  inject,
  Injectable,
  InjectionToken,
  Logger,
  runWithRequestId,
} from '@navios/core'

import type { FastifyHandlerAdapterInterface } from '../adapters/index.mjs'

import { FastifyExecutionContext } from '../interfaces/index.mjs'
import { FastifyReplyToken, FastifyRequestToken } from '../tokens/index.mjs'

@Injectable()
export class FastifyControllerAdapterService {
  private guardRunner = inject(GuardRunnerService)
  private container = inject(Container)
  private logger = inject(Logger, {
    context: FastifyControllerAdapterService.name,
  })

  async setupController(
    controller: ClassType,
    instance: FastifyInstance,
    moduleMetadata: ModuleMetadata,
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
        adapterToken as InjectionToken<FastifyHandlerAdapterInterface>,
      )
      const hasSchema = adapter.hasSchema?.(endpoint) ?? false
      if (hasSchema) {
        instance.withTypeProvider<ZodTypeProvider>().route({
          method: httpMethod,
          url: url.replaceAll('$', ':'),
          schema: adapter.provideSchema?.(endpoint) ?? {},
          handler: this.wrapHandler(
            adapter.provideHandler(controller, endpoint),
            moduleMetadata,
            controllerMetadata,
            endpoint,
          ),
        })
      } else {
        instance.route({
          method: httpMethod,
          url: url.replaceAll('$', ':'),
          handler: this.wrapHandler(
            adapter.provideHandler(controller, endpoint),
            moduleMetadata,
            controllerMetadata,
            endpoint,
          ),
        })
      }

      this.logger.debug(
        `Registered ${httpMethod} ${url} for ${controller.name}:${classMethod}`,
      )
    }
  }
  private wrapHandler(
    handler: (
      context: ScopedContainer,
      request: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<any>,
    moduleMetadata: ModuleMetadata,
    controllerMetadata: ControllerMetadata,
    endpoint: HandlerMetadata,
  ) {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const executionContext = new FastifyExecutionContext(
        moduleMetadata,
        controllerMetadata,
        endpoint,
        request,
        reply,
      )
      const requestId = crypto.randomUUID()
      const requestContainer = this.container.beginRequest(requestId)
      requestContainer.addInstance(FastifyRequestToken, request)
      requestContainer.addInstance(FastifyReplyToken, reply)
      requestContainer.addInstance(ExecutionContext, executionContext)

      try {
        return await runWithRequestId(requestId, async () => {
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
              requestContainer,
            )
            if (!canActivate) {
              return reply.status(403).send({ message: 'Forbidden' })
            }
          }

          const response = await handler(requestContainer, request, reply)
          return response
        })
      } catch (error) {
        // Handle errors
        if (error instanceof HttpException) {
          return reply.status(error.statusCode).send(error.response)
        } else {
          const err = error as Error
          this.logger.error(`Error: ${err.message}`, err)
          return reply.status(500).send({
            statusCode: 500,
            message: err.message || 'Internal Server Error',
            error: 'InternalServerError',
          })
        }
      } finally {
        requestContainer.endRequest().catch((err: any) => {
          this.logger.error(
            `Error ending request context ${requestId}: ${err.message}`,
            err,
          )
        })
      }
    }
  }
}
