import type { BaseEndpointConfig } from '@navios/common'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { ZodTypeProvider } from 'fastify-type-provider-zod'
import type { AnyZodObject } from 'zod'

import { NaviosException } from '@navios/common'

import { ZodArray } from 'zod'

import type { EndpointMetadata, ModuleMetadata } from '../metadata/index.mjs'
import type { ClassType } from '../service-locator/index.mjs'

import { Logger } from '../logger/index.mjs'
import { EndpointType, extractControllerMetadata } from '../metadata/index.mjs'
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
  private logger = syncInject(Logger, {
    context: ControllerAdapterService.name,
  })

  setupController(
    controller: ClassType,
    instance: FastifyInstance,
    moduleMetadata: ModuleMetadata,
  ): void {
    const controllerMetadata = extractControllerMetadata(controller)
    for (const endpoint of controllerMetadata.endpoints) {
      const { classMethod, url, httpMethod } = endpoint

      if (!url) {
        throw new Error(
          `[Navios] Malformed Endpoint ${controller.name}:${classMethod}`,
        )
      }
      const executionContext = new ExecutionContext(
        moduleMetadata,
        controllerMetadata,
        endpoint,
      )
      instance.withTypeProvider<ZodTypeProvider>().route({
        method: httpMethod,
        url: url.replaceAll('$', ':'),
        schema: this.provideSchemaForConfig(endpoint),
        preHandler: this.providePreHandler(executionContext),
        handler: this.provideHandler(controller, executionContext, endpoint),
      })

      this.logger.debug(
        `Registered ${httpMethod} ${url} for ${controller.name}:${classMethod}`,
      )
    }
  }

  providePreHandler(executionContext: ExecutionContext) {
    const guards = this.guardRunner.makeContext(executionContext)
    return guards.size > 0
      ? async (request: FastifyRequest, reply: FastifyReply) => {
          getServiceLocator().registerInstance(Request, request)
          getServiceLocator().registerInstance(Reply, reply)
          getServiceLocator().registerInstance(
            ExecutionContextToken,
            executionContext,
          )
          executionContext.provideRequest(request)
          executionContext.provideReply(reply)
          let canActivate = true
          try {
            canActivate = await this.guardRunner.runGuards(
              guards,
              executionContext,
            )
          } finally {
            getServiceLocator().removeInstance(Request)
            getServiceLocator().removeInstance(Reply)
            getServiceLocator().removeInstance(ExecutionContextToken)
          }
          if (!canActivate) {
            return reply
          }
        }
      : undefined
  }

  private provideSchemaForConfig(endpointMetadata: EndpointMetadata) {
    if (!endpointMetadata.config) {
      this.logger.warn(`No config found for endpoint ${endpointMetadata.url}`)
      return {}
    }
    const { querySchema, requestSchema, responseSchema } =
      endpointMetadata.config as BaseEndpointConfig
    const schema: Record<string, any> = {}
    if (querySchema) {
      schema.querystring = querySchema
    }
    if (requestSchema && endpointMetadata.type !== EndpointType.Multipart) {
      schema.body = requestSchema
    }
    if (responseSchema) {
      schema.response = {
        200: responseSchema,
      }
    }

    return schema
  }

  private provideHandler(
    controller: ClassType,
    executionContext: ExecutionContext,
    endpointMetadata: EndpointMetadata,
  ): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
    switch (endpointMetadata.type) {
      case EndpointType.Unknown:
        this.logger.error(
          `Unknown endpoint type ${endpointMetadata.type} for ${controller.name}:${endpointMetadata.classMethod}`,
        )
        throw new NaviosException('Unknown endpoint type')
      case EndpointType.Endpoint:
        return this.provideHandlerForConfig(
          controller,
          executionContext,
          endpointMetadata,
        )
      case EndpointType.Stream:
        return this.provideHandlerForStream(
          controller,
          executionContext,
          endpointMetadata,
        )
      case EndpointType.Multipart:
        return this.provideHandlerForMultipart(
          controller,
          executionContext,
          endpointMetadata,
        )
      case EndpointType.Handler:
        this.logger.error('Not implemented yet')
        throw new NaviosException('Not implemented yet')
    }
  }

  private provideHandlerForConfig(
    controller: ClassType,
    executionContext: ExecutionContext,
    endpointMetadata: EndpointMetadata,
  ): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
    return async (request, reply) => {
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
        const result =
          await controllerInstance[endpointMetadata.classMethod](argument)
        reply
          .status(endpointMetadata.successStatusCode)
          .headers(endpointMetadata.headers)
          .send(result)
      } finally {
        getServiceLocator().removeInstance(Request)
        getServiceLocator().removeInstance(Reply)
        getServiceLocator().removeInstance(ExecutionContextToken)
      }
    }
  }

  private provideHandlerForStream(
    controller: ClassType,
    executionContext: ExecutionContext,
    endpointMetadata: EndpointMetadata,
  ): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
    return async (request, reply) => {
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

        await controllerInstance[endpointMetadata.classMethod](argument, reply)
      } finally {
        getServiceLocator().removeInstance(Request)
        getServiceLocator().removeInstance(Reply)
        getServiceLocator().removeInstance(ExecutionContextToken)
      }
    }
  }

  private provideHandlerForMultipart(
    controller: ClassType,
    executionContext: ExecutionContext,
    endpointMetadata: EndpointMetadata,
  ): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
    const config = endpointMetadata.config as BaseEndpointConfig
    const requestSchema = config.requestSchema as unknown as AnyZodObject
    const shape = requestSchema._def.shape()
    return async (request, reply) => {
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
        const parts = request.parts()
        const { query, params } = request
        const argument: Record<string, any> = {}
        if (query && Object.keys(query).length > 0) {
          argument.params = query
        }
        if (params && Object.keys(params).length > 0) {
          argument.urlParams = params
        }
        const req: Record<string, any> = {}
        for await (const part of parts) {
          if (!shape[part.fieldname]) {
            throw new NaviosException(
              `Invalid field name ${part.fieldname} for multipart request`,
            )
          }
          const schema = shape[part.fieldname]
          if (part.type === 'file') {
            const file = new File([await part.toBuffer()], part.filename, {
              type: part.mimetype,
            })
            if (schema instanceof ZodArray) {
              if (!req[part.fieldname]) {
                req[part.fieldname] = []
              }
              req[part.fieldname].push(file)
            } else {
              req[part.fieldname] = file
            }
          } else {
            if (schema instanceof ZodArray) {
              if (!req[part.fieldname]) {
                req[part.fieldname] = []
              }
              req[part.fieldname].push(part.value)
            } else {
              req[part.fieldname] = part.value
            }
          }
        }
        argument.data = requestSchema.parse(req)
        const result =
          await controllerInstance[endpointMetadata.classMethod](argument)
        reply
          .status(endpointMetadata.successStatusCode)
          .headers(endpointMetadata.headers)
          .send(result)
      } finally {
        getServiceLocator().removeInstance(Request)
        getServiceLocator().removeInstance(Reply)
        getServiceLocator().removeInstance(ExecutionContextToken)
      }
    }
  }
}
