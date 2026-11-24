import { Injectable, InjectionToken } from '@navios/core'
import { ZodArray, ZodObject, ZodOptional } from 'zod/v4'

import type { MultipartFile, MultipartValue } from '@fastify/multipart'
import type { ArgumentGetter, HandlerMetadata, ZodBaseEndpointOptions } from '@navios/core'
import type { FastifyRequest } from 'fastify'
import type { ZodRawShape } from 'zod/v4'

import { FastifyEndpointAdapterService } from './endpoint-adapter.service.mjs'

/**
 * Injection token for the Fastify multipart adapter service.
 *
 * This token is used to inject the `FastifyMultipartAdapterService` instance
 * into the dependency injection container.
 */
export const FastifyMultipartAdapterToken = InjectionToken.create<FastifyMultipartAdapterService>(
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
 * The response side is inherited unchanged from the endpoint adapter: a JSON
 * reply validated with `responseSchema`, an empty reply for `response: 'void'`
 * (204 unless `@HttpCode` set another status), or the status and body picked
 * with `reply(status, body)` for a per-status `responses` map.
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
   * Creates argument getters for parsing multipart form data.
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
  protected override createArgumentGetters(
    handlerMetadata: HandlerMetadata<ZodBaseEndpointOptions>,
  ): ArgumentGetter<FastifyRequest>[] {
    const config = handlerMetadata.config
    const getters: ArgumentGetter<FastifyRequest>[] = []

    if (config.querySchema) {
      getters.push((target, request) => {
        target.params = request.query
      })
    }

    if (this.hasUrlParams(config)) {
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
   * Provides Fastify schema information for multipart handlers.
   *
   * The same schema as a plain endpoint — query string, error schemas and the
   * success schemas (`responseSchema` under 200, every schema of a per-status
   * `responses` map under its own status, none for `response: 'void'`) —
   * without the request body: a multipart body is parsed and validated while
   * the parts are read, not by Fastify.
   *
   * @param handlerMetadata - The handler metadata containing configuration and schemas.
   * @returns A Fastify route schema object.
   */
  override provideSchema(
    handlerMetadata: HandlerMetadata<ZodBaseEndpointOptions>,
  ): Record<string, any> {
    const { body: _body, ...schema } = super.provideSchema(handlerMetadata)
    return schema
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
      value = new File([(await part.toBuffer()) as unknown as ArrayBuffer], part.filename, {
        type: part.mimetype,
      })
    } else {
      value = part.value
      if (isObject && typeof value === 'string') {
        try {
          value = JSON.parse(value)
        } catch {
          value = null
        }
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
      {} as Record<string, { isArray: boolean; isOptional: boolean; isObject: boolean }>,
    )
  }
}
