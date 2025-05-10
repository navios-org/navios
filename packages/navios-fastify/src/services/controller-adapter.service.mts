import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'

import type { ModuleMetadata } from '../metadata/index.mjs'
import type { ClassType } from '../service-locator/index.mjs'

import { HttpException } from '../exceptions/index.mjs'
import { extractControllerMetadata } from '../metadata/index.mjs'
import {
  getServiceLocator,
  inject,
  Injectable,
  syncInject,
} from '../service-locator/index.mjs'
import { ExecutionContextToken, Reply, Request } from '../tokens/index.mjs'
import { ExecutionContext } from './execution-context.mjs'
import { GuardRunnerService } from './guard-runner.service.mjs'

@Injectable()
export class ControllerAdapterService {
  guardRunner = syncInject(GuardRunnerService)

  setupController(
    controller: ClassType,
    instance: FastifyInstance,
    moduleMetadata: ModuleMetadata,
  ): void {
    const controllerMetadata = extractControllerMetadata(controller)
    for (const endpoint of controllerMetadata.endpoints) {
      const { classMethod, url, httpMethod, config } = endpoint

      if (!url || !config) {
        throw new Error(
          `[Navios] Malformed Endpoint ${controller.name}:${classMethod}`,
        )
      }
      const executionContext = new ExecutionContext(
        moduleMetadata,
        controllerMetadata,
        endpoint,
      )
      const guards = this.guardRunner.makeContext(executionContext)
      const { querySchema, requestSchema, responseSchema } = config
      const schema: Record<string, any> = {}
      if (querySchema) {
        schema.querystring = querySchema
      }
      if (requestSchema) {
        schema.body = requestSchema
      }
      if (responseSchema) {
        schema.response = {
          200: responseSchema,
        }
      }
      instance.withTypeProvider<ZodTypeProvider>().route({
        method: httpMethod,
        url: url.replaceAll('$', ':'),
        schema,
        preHandler: async (request, reply) => {
          if (guards.size > 0) {
            getServiceLocator().registerInstance(Request, request)
            getServiceLocator().registerInstance(Reply, reply)
            getServiceLocator().registerInstance(
              ExecutionContextToken,
              executionContext,
            )
            executionContext.provideRequest(request)
            executionContext.provideReply(reply)
            const canActivate = await this.guardRunner.runGuards(
              guards,
              executionContext,
            )
            getServiceLocator().removeInstance(Request)
            getServiceLocator().removeInstance(Reply)
            getServiceLocator().removeInstance(ExecutionContextToken)
            if (!canActivate) {
              return reply
            }
          }
        },
        handler: async (request, reply) => {
          getServiceLocator().registerInstance(Request, request)
          getServiceLocator().registerInstance(Reply, reply)
          getServiceLocator().registerInstance(
            ExecutionContextToken,
            executionContext,
          )
          executionContext.provideRequest(request)
          executionContext.provideReply(reply)
          const controllerInstance = await inject(controller)
          try {
            const { query, params, body } = request
            const argument: Record<string, any> = {}
            if (query && Object.keys(query).length > 0) {
              argument.params = query
            }
            if (params && Object.keys(params).length > 0) {
              argument.urlParams = params
            }
            if (body) {
              argument.data = body
            }
            const result = await controllerInstance[classMethod](argument)
            reply.status(200).send(result)
          } catch (error) {
            if (error instanceof HttpException) {
              reply.status(error.statusCode).send(error.response)
            } else {
              reply.status(500).send({
                message: 'Internal server error',
                error: (error as Error).message,
              })
            }
          } finally {
            getServiceLocator().removeInstance(Request)
            getServiceLocator().removeInstance(Reply)
            getServiceLocator().removeInstance(ExecutionContextToken)
          }
        },
      })
    }
  }
}
