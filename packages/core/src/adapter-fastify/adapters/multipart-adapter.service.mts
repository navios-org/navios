import type { MultipartFile, MultipartValue } from '@fastify/multipart'
import type { BaseEndpointConfig } from '@navios/builder'
import type { FastifyRequest } from 'fastify'
import type { ZodRawShape } from 'zod/v4'

import { Injectable, InjectionToken } from '@navios/di'

import { ZodArray, ZodObject, ZodOptional } from 'zod/v4'

import type { HandlerMetadata } from '../../metadata/index.mjs'

import { FastifyEndpointAdapterService } from './endpoint-adapter.service.mjs'

export const FastifyMultipartAdapterToken =
  InjectionToken.create<FastifyMultipartAdapterService>(
    Symbol.for('FastifyMultipartAdapterService'),
  )

@Injectable({
  token: FastifyMultipartAdapterToken,
})
export class FastifyMultipartAdapterService extends FastifyEndpointAdapterService {
  prepareArguments(
    handlerMetadata: HandlerMetadata<BaseEndpointConfig>,
  ): ((target: Record<string, any>, request: FastifyRequest) => void)[] {
    const config = handlerMetadata.config
    const getters: ((
      target: Record<string, any>,
      request: FastifyRequest,
    ) => void | Promise<void>)[] = []
    if (config.querySchema) {
      getters.push((target, request) => {
        target.params = request.query
      })
    }
    if (config.url.includes('$')) {
      getters.push((target, request) => {
        target.urlParams = request.params
      })
    }
    const requestSchema = config.requestSchema as unknown as ZodObject
    const shape = requestSchema._zod.def.shape
    const structure = this.analyzeSchema(shape)
    getters.push(async (target, request) => {
      const req: Record<string, any> = {}
      for await (const part of request.parts()) {
        await this.populateRequest(structure, part, req)
      }
      target.data = requestSchema.parse(req)
    })

    return getters
  }

  private async populateRequest(
    structure: {
      [p: string]: { isArray: boolean; isOptional: boolean; isObject: boolean }
    },
    part: MultipartFile | MultipartValue<unknown>,
    req: Record<string, any>,
  ) {
    const { isArray, isObject } = structure[part.fieldname] ?? {}
    if (isArray && !req[part.fieldname]) {
      req[part.fieldname] = []
    }
    let value
    if (part.type === 'file') {
      value = new File(
        [(await part.toBuffer()) as unknown as ArrayBuffer],
        part.filename,
        {
          type: part.mimetype,
        },
      )
    } else {
      value = part.value
      if (isObject && typeof value === 'string') {
        value = JSON.parse(value)
      }
    }

    if (isArray) {
      req[part.fieldname].push(value)
    } else {
      req[part.fieldname] = value
    }
  }

  private analyzeSchema(shape: ZodRawShape) {
    return Object.keys(shape).reduce(
      (target, key) => {
        let schema = shape[key]
        const isOptional = schema instanceof ZodOptional
        if (isOptional) {
          schema = (schema as ZodOptional<any>).unwrap()
        }
        const isArray = schema instanceof ZodArray
        if (isArray) {
          schema = (schema as ZodArray<any>).element
        }
        const isObject = schema instanceof ZodObject
        return {
          ...target,
          [key]: {
            isArray,
            isOptional,
            isObject,
          },
        }
      },
      {} as Record<
        string,
        { isArray: boolean; isOptional: boolean; isObject: boolean }
      >,
    )
  }

  override provideSchema(
    handlerMetadata: HandlerMetadata<BaseEndpointConfig>,
  ): Record<string, any> {
    const schema: Record<string, any> = {}
    const { querySchema, responseSchema } = handlerMetadata.config

    if (querySchema) {
      schema.querystring = querySchema
    }
    if (responseSchema) {
      schema.response = {
        200: responseSchema,
      }
    }

    return schema
  }
}
