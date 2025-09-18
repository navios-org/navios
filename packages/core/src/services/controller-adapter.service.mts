import type { ClassType, RequestContextHolder } from '@navios/di'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'

import { Container, inject, Injectable, InjectionToken } from '@navios/di'

import type { HandlerAdapterInterface } from '../adapters/index.mjs'
import type { ModuleMetadata } from '../metadata/index.mjs'

import { Logger } from '../logger/index.mjs'
import { extractControllerMetadata } from '../metadata/index.mjs'
import { ExecutionContextToken, Reply, Request } from '../tokens/index.mjs'
import { ExecutionContext } from './execution-context.mjs'
import { GuardRunnerService } from './guard-runner.service.mjs'

@Injectable()
export class ControllerAdapterService {
  private guardRunner = inject(GuardRunnerService)
  private container = inject(Container)
  private logger = inject(Logger, {
    context: ControllerAdapterService.name,
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
        adapterToken as InjectionToken<HandlerAdapterInterface>,
      )
      const executionContext = new ExecutionContext(
        moduleMetadata,
        controllerMetadata,
        endpoint,
      )
      const hasSchema = adapter.hasSchema?.(endpoint) ?? false
      if (hasSchema) {
        instance.withTypeProvider<ZodTypeProvider>().route({
          method: httpMethod,
          url: url.replaceAll('$', ':'),
          schema: adapter.provideSchema?.(endpoint) ?? {},
          preHandler: this.providePreHandler(executionContext),
          handler: this.wrapHandler(
            executionContext,
            adapter.provideHandler(controller, executionContext, endpoint),
          ),
        })
      } else {
        instance.route({
          method: httpMethod,
          url: url.replaceAll('$', ':'),
          preHandler: this.providePreHandler(executionContext),
          handler: this.wrapHandler(
            executionContext,
            adapter.provideHandler(controller, executionContext, endpoint),
          ),
        })
      }

      this.logger.debug(
        `Registered ${httpMethod} ${url} for ${controller.name}:${classMethod}`,
      )
    }
  }

  providePreHandler(executionContext: ExecutionContext) {
    const guards = this.guardRunner.makeContext(executionContext)
    return guards.size > 0
      ? this.wrapHandler(
          executionContext,
          async (
            context: RequestContextHolder,
            request: FastifyRequest,
            reply: FastifyReply,
          ) => {
            let canActivate = true
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

  private wrapHandler(
    executionContext: ExecutionContext,
    handler: (
      context: RequestContextHolder,
      request: FastifyRequest,
      reply: FastifyReply,
    ) => Promise<void>,
  ) {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const requestContext = this.container.beginRequest(request.id)
      requestContext.addInstance(Request, request)
      requestContext.addInstance(Reply, reply)
      requestContext.addInstance(ExecutionContextToken, executionContext)
      executionContext.provideRequest(request)
      executionContext.provideReply(reply)
      try {
        return await handler(requestContext, request, reply)
      } finally {
        await this.container.endRequest(request.id)
      }
    }
  }
}
