import type { ClassType, RequestContextHolder } from '@navios/di'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'

import { Container, inject, Injectable, InjectionToken } from '@navios/di'

import type {
  ControllerMetadata,
  HandlerMetadata,
  ModuleMetadata,
} from '../../index.mjs'
import type { FastifyHandlerAdapterInterface } from '../adapters/index.mjs'

import {
  ExecutionContext,
  extractControllerMetadata,
  GuardRunnerService,
  InternalServerErrorException,
  Logger,
} from '../../index.mjs'
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
          onRequest: this.provideOnRequest(
            moduleMetadata,
            controllerMetadata,
            endpoint,
          ),
          preHandler: this.providePreHandler(
            moduleMetadata,
            controllerMetadata,
            endpoint,
          ),
          handler: this.wrapHandler(
            adapter.provideHandler(controller, endpoint),
          ),
          onResponse: this.provideOnResponse(),
        })
      } else {
        instance.route({
          method: httpMethod,
          url: url.replaceAll('$', ':'),
          onRequest: this.provideOnRequest(
            moduleMetadata,
            controllerMetadata,
            endpoint,
          ),
          preHandler: this.providePreHandler(
            moduleMetadata,
            controllerMetadata,
            endpoint,
          ),
          handler: this.wrapHandler(
            adapter.provideHandler(controller, endpoint),
          ),
          onResponse: this.provideOnResponse(),
        })
      }

      this.logger.debug(
        `Registered ${httpMethod} ${url} for ${controller.name}:${classMethod}`,
      )
    }
  }
  private provideOnRequest(
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
      const requestContext = this.container.beginRequest(request.id)
      requestContext.addInstance(FastifyRequestToken, request)
      requestContext.addInstance(FastifyReplyToken, reply)
      requestContext.addInstance(ExecutionContext, executionContext)
    }
  }

  private providePreHandler(
    moduleMetadata: ModuleMetadata,
    controllerMetadata: ControllerMetadata,
    endpoint: HandlerMetadata,
  ) {
    const guards = this.guardRunner.makeContext(
      moduleMetadata,
      controllerMetadata,
      endpoint,
    )
    return guards.size > 0
      ? this.wrapHandler(
          async (
            context: RequestContextHolder,
            request: FastifyRequest,
            reply: FastifyReply,
          ) => {
            let canActivate = true
            const executionContext = context.getInstance(
              ExecutionContext.toString(),
            ) as FastifyExecutionContext
            canActivate = await this.guardRunner.runGuards(
              guards,
              executionContext,
            )
            if (!canActivate) {
              return reply
            }
          },
        )
      : undefined
  }

  private provideOnResponse() {
    return async (request: FastifyRequest) => {
      await this.container.endRequest(request.id)
    }
  }

  private wrapHandler(
    handler: (
      context: RequestContextHolder,
      request: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<void>,
  ) {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      this.container.setCurrentRequestContext(request.id)
      const requestContext = this.container.getCurrentRequestContext()
      if (!requestContext) {
        throw new InternalServerErrorException(
          '[Navios] Request context not found',
        )
      }
      return await handler(requestContext, request, reply)
    }
  }
}
