import type { FastifyInstance } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'

import { console } from 'inspector'

import type { ClassType } from '../service-locator/index.mjs'

import { getControllerMetadata } from '../decorators/index.mjs'
import { HttpException } from '../exceptions/index.mjs'
import {
  getServiceLocator,
  inject,
  Injectable,
} from '../service-locator/index.mjs'
import { Reply, Request } from '../tokens/index.mjs'

@Injectable()
export class ControllerAdapterService {
  setupController(controller: ClassType, instance: FastifyInstance): void {
    const { endpoints } = getControllerMetadata(controller)
    for (const [path, methods] of endpoints) {
      for (const [httpMethod, { method, config }] of methods) {
        const schema: Record<string, any> = {}
        const { querySchema, requestSchema, responseSchema } = config
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
          url: path.replaceAll('$', ':'),
          schema,
          handler: async (request, reply) => {
            getServiceLocator().registerInstance(Request, request)
            getServiceLocator().registerInstance(Reply, reply)
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
              const result = await controllerInstance[method](argument)
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
            }
          },
        })
      }
    }
  }
}
