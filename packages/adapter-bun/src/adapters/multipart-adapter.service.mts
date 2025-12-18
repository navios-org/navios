import type { BaseEndpointConfig } from '@navios/builder'
import type { HandlerMetadata } from '@navios/core'
import type { BunRequest } from 'bun'

import { Injectable, InjectionToken } from '@navios/core'

import { BunEndpointAdapterService } from './endpoint-adapter.service.mjs'

/**
 * Injection token for the Bun multipart adapter service.
 *
 * This token is used to inject the `BunMultipartAdapterService` instance
 * into the dependency injection container.
 */
export const BunMultipartAdapterToken =
  InjectionToken.create<BunMultipartAdapterService>(
    Symbol.for('BunMultipartAdapterService'),
  )

/**
 * Adapter service for handling multipart/form-data requests in Bun.
 *
 * This service extends `BunEndpointAdapterService` and provides specialized
 * handling for file uploads and multipart form data. It automatically parses
 * FormData objects, handles file uploads, and validates the data against
 * Zod schemas.
 *
 * @extends {BunEndpointAdapterService}
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
  token: BunMultipartAdapterToken,
})
export class BunMultipartAdapterService extends BunEndpointAdapterService {
  /**
   * Prepares argument getters for parsing multipart form data.
   *
   * This method creates an array of functions that extract and validate
   * data from multipart requests, including:
   * - Query parameters
   * - URL parameters
   * - Form fields and file uploads from FormData
   *
   * Files are preserved as File objects, and form fields are parsed and
   * validated against the request schema.
   *
   * @param handlerMetadata - The handler metadata with schemas and configuration.
   * @returns An array of getter functions that populate request arguments.
   */
  override prepareArguments(
    handlerMetadata: HandlerMetadata<BaseEndpointConfig>,
  ): ((
    target: Record<string, any>,
    request: BunRequest,
  ) => void | Promise<void>)[] {
    const config = handlerMetadata.config
    const getters: ((
      target: Record<string, any>,
      request: BunRequest,
    ) => void | Promise<void>)[] = []

    // Handle query parameters
    if (config.querySchema) {
      const schema = config.querySchema
      getters.push((target, request) => {
        const url = new URL(request.url)
        // @ts-expect-error - schema is unknown type
        target.params = schema.parse(Object.fromEntries(url.searchParams))
      })
    }

    // Handle URL parameters
    if (config.url.includes('$')) {
      getters.push((target, request) => {
        target.urlParams = request.params
      })
    }

    // Handle multipart form data
    if (config.requestSchema) {
      const schema = config.requestSchema
      getters.push(async (target, request) => {
        const formData = await request.formData()
        const formDataObject: Record<string, any> = {}

        // Convert FormData to object
        for (const [key, value] of formData.entries()) {
          // @ts-expect-error - File is not defined in the global scope
          if (value instanceof File) {
            // Handle file uploads
            if (formDataObject[key]) {
              // If key already exists, convert to array
              if (Array.isArray(formDataObject[key])) {
                formDataObject[key].push(value)
              } else {
                formDataObject[key] = [formDataObject[key], value]
              }
            } else {
              formDataObject[key] = value
            }
          } else {
            // Handle text fields
            if (formDataObject[key]) {
              // If key already exists, convert to array
              if (Array.isArray(formDataObject[key])) {
                formDataObject[key].push(value)
              } else {
                formDataObject[key] = [formDataObject[key], value]
              }
            } else {
              formDataObject[key] = value
            }
          }
        }

        // Parse with schema
        // @ts-expect-error - schema is unknown type
        target.data = schema.parse(formDataObject)
      })
    }

    return getters
  }
}
