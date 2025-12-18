import type { MultipartFile, MultipartValue } from '@fastify/multipart'
import type { BaseEndpointConfig } from '@navios/builder'
import type { HandlerMetadata } from '@navios/core'
import type { FastifyRequest } from 'fastify'
import type { ZodRawShape } from 'zod/v4'

import { Injectable, InjectionToken } from '@navios/core'

import { ZodArray, ZodObject, ZodOptional } from 'zod/v4'

import { FastifyEndpointAdapterService } from './endpoint-adapter.service.mjs'

/**
 * Injection token for the Fastify multipart adapter service.
 *
 * This token is used to inject the `FastifyMultipartAdapterService` instance
 * into the dependency injection container.
 */
export const FastifyMultipartAdapterToken =
  InjectionToken.create<FastifyMultipartAdapterService>(
    Symbol.for('FastifyMultipartAdapterService'),
  )

/**
 * Adapter service for handling multipart/form-data requests in Fastify.
 *
 * This service extends `FastifyEndpointAdapterService` and provides specialized
 * handling for file uploads and multipart form data. It automatically parses
 * multipart streams, handles file uploads, converts files to File objects,
 * and validates the data against Zod schemas.
 *
 * @extends {FastifyEndpointAdapterService}
 *
 * @example
 * ```ts
 * // Used automatically when defining endpoints with @Multipart()
 * @Controller()
 * class UploadController {
 *   @Multipart({
 *     method: 'POST',
 *     url: '/upload',
 *     requestSchema: uploadSchema,
 *   })
 *   async uploadFile(data: UploadDto) {
 *     // data contains parsed form fields and File objects
 *     return { success: true }
 *   }
 * }
 * ```
 */
@Injectable({
  token: FastifyMultipartAdapterToken,
})
export class FastifyMultipartAdapterService extends FastifyEndpointAdapterService {
  /**
   * Prepares argument getters for parsing multipart form data.
   *
   * This method creates an array of functions that extract and validate
   * data from multipart requests, including:
   * - Query parameters
   * - URL parameters
   * - Form fields and file uploads from multipart streams
   *
   * Files are converted to File objects, and form fields are parsed and
   * validated against the request schema. Supports arrays and nested objects.
   *
   * @param handlerMetadata - The handler metadata with schemas and configuration.
   * @returns An array of getter functions that populate request arguments.
   */
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

  /**
   * Populates the request object with multipart data.
   *
   * Handles file uploads, form fields, arrays, and nested objects based on
   * the schema structure.
   *
   * @param structure - Schema structure analysis results.
   * @param part - Multipart part (file or value).
   * @param req - Request object to populate.
   * @private
   */
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

  /**
   * Analyzes the Zod schema shape to determine field types.
   *
   * Determines which fields are arrays, optional, or objects to properly
   * handle multipart parsing.
   *
   * @param shape - The Zod schema shape definition.
   * @returns An object mapping field names to their type information.
   * @private
   */
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

  /**
   * Provides Fastify schema information for multipart handlers.
   *
   * Creates a Fastify route schema object that includes query string and
   * response schemas. Note that multipart body schemas are handled separately
   * during request parsing.
   *
   * @param handlerMetadata - The handler metadata containing configuration and schemas.
   * @returns A Fastify route schema object.
   */
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
