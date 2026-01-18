import { Injectable, InjectionToken } from '@navios/core'

import type { EndpointOptions } from '@navios/builder'
import type { ArgumentGetter, HandlerMetadata } from '@navios/core'
import type { BunRequest } from 'bun'

import { BunEndpointAdapterService } from './endpoint-adapter.service.mjs'

/**
 * Injection token for the Bun multipart adapter service.
 *
 * This token is used to inject the `BunMultipartAdapterService` instance
 * into the dependency injection container.
 */
export const BunMultipartAdapterToken = InjectionToken.create<BunMultipartAdapterService>(
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
   * Creates argument getters for parsing multipart form data.
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
  protected override createArgumentGetters(
    handlerMetadata: HandlerMetadata<EndpointOptions>,
  ): ArgumentGetter<BunRequest>[] {
    const config = handlerMetadata.config
    const getters: ArgumentGetter<BunRequest>[] = []

    // Handle query parameters
    if (config.querySchema) {
      const schema = config.querySchema
      getters.push((target, request) => {
        const url = new URL(request.url)
        target.params = schema.parse(Object.fromEntries(url.searchParams))
      })
    }

    // Handle URL parameters
    if (this.hasUrlParams(config)) {
      getters.push((target, request) => {
        target.urlParams = request.params
      })
    }

    // Handle multipart form data
    if (config.requestSchema) {
      const schema = config.requestSchema
      getters.push(async (target, request) => {
        const formData = await request.formData()
        const formDataObject = this.parseFormData(formData)
        target.data = schema.parse(formDataObject)
      })
    }

    return getters
  }

  /**
   * Parses FormData into a plain object with array support for multiple values.
   */
  private parseFormData(formData: FormData): Record<string, any> {
    const result: Record<string, any> = {}

    for (const [key, value] of formData.entries()) {
      if (result[key]) {
        if (Array.isArray(result[key])) {
          result[key].push(value)
        } else {
          result[key] = [result[key], value]
        }
      } else {
        result[key] = value
      }
    }

    return result
  }
}
