import type { ClassType, EndpointResult } from '@navios/core'

import { builder } from '@navios/builder'
import { Controller, Endpoint, inject } from '@navios/core'
import { ApiExclude } from '@navios/openapi'

import { z } from 'zod'

import { OpenApiDocumentServiceToken } from '../services/openapi-document.service.mjs'

/**
 * Schema for OpenAPI document response.
 * Uses z.record(z.unknown()) since OpenAPI documents have complex structure.
 */
const openApiDocumentSchema = z.record(z.string(), z.unknown())

/**
 * Creates a customized JSON controller with the correct path.
 * Called by the plugin to create a controller with the configured jsonPath.
 *
 * @param jsonPath - The path to serve the OpenAPI JSON (e.g., '/openapi.json')
 * @returns A controller class that serves the OpenAPI document as JSON
 */
export function createOpenApiJsonController(jsonPath: string): ClassType {
  const API = builder()

  const endpoint = API.declareEndpoint({
    method: 'GET',
    url: jsonPath,
    responseSchema: openApiDocumentSchema,
  })

  @ApiExclude()
  @Controller()
  class OpenApiJsonController {
    private documentService = inject(OpenApiDocumentServiceToken)

    @Endpoint(endpoint)
    async getJson(): EndpointResult<typeof endpoint> {
      return this.documentService.getDocument() as unknown as Record<
        string,
        unknown
      >
    }
  }

  return OpenApiJsonController
}
