import type { ClassType } from '@navios/di'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'

import {
  getGlobalServiceLocator,
  inject,
  Injectable,
  InjectionToken,
  syncInject,
} from '@navios/di'

import type { HandlerAdapterInterface } from '../adapters/index.mjs'
import type { ModuleMetadata } from '../metadata/index.mjs'

import { Logger } from '../logger/index.mjs'
import { extractControllerMetadata } from '../metadata/index.mjs'
import { ExecutionContextToken, Reply, Request } from '../tokens/index.mjs'
import { ExecutionContext } from './execution-context.mjs'
import { GuardRunnerService } from './guard-runner.service.mjs'

@Injectable()
export class ControllerAdapterService {
  guardRunner = syncInject(GuardRunnerService)
  private logger = syncInject(Logger, {
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
      const adapter = await inject(
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
          async (request: FastifyRequest, reply: FastifyReply) => {
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
    handler: (request: FastifyRequest, reply: FastifyReply) => Promise<void>,
  ) {
    const locator = getGlobalServiceLocator()
    return async (request: FastifyRequest, reply: FastifyReply) => {
      locator.storeInstance(request, Request)
      locator.storeInstance(reply, Reply)
      locator.storeInstance(executionContext, ExecutionContextToken)
      executionContext.provideRequest(request)
      executionContext.provideReply(reply)
      try {
        return await handler(request, reply)
      } finally {
        Promise.all([
          locator.removeInstance(Request),
          locator.removeInstance(Reply),
          locator.removeInstance(ExecutionContextToken),
        ]).catch((err) => {
          this.logger.warn(`Error removing instances: ${err}`)
        })
      }
    }
  }
}
