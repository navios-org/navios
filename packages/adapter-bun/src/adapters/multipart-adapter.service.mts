import type { BaseEndpointConfig } from '@navios/builder'
import type { HandlerMetadata } from '@navios/core'
import type { BunRequest } from 'bun'

import { Injectable, InjectionToken } from '@navios/core'

import { BunEndpointAdapterService } from './endpoint-adapter.service.mjs'

export const BunMultipartAdapterToken =
  InjectionToken.create<BunMultipartAdapterService>(
    Symbol.for('BunMultipartAdapterService'),
  )

@Injectable({
  token: BunMultipartAdapterToken,
})
export class BunMultipartAdapterService extends BunEndpointAdapterService {
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
