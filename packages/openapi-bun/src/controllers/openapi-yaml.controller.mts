import { builder } from '@navios/builder'
import { Controller, inject, Stream } from '@navios/core'
import { ApiExclude, ApiStream } from '@navios/openapi'

import type { ClassType } from '@navios/core'

import { OpenApiDocumentServiceToken } from '../services/openapi-document.service.mjs'

/**
 * Creates a customized YAML controller with the correct path.
 * Uses Stream endpoint to set content-type header properly.
 *
 * @param yamlPath - The path to serve the OpenAPI YAML (e.g., '/openapi.yaml')
 * @returns A controller class that serves the OpenAPI document as YAML
 */
export function createOpenApiYamlController(yamlPath: string): ClassType {
  const API = builder()

  const endpoint = API.declareStream({
    method: 'GET',
    url: yamlPath,
  })

  @ApiExclude()
  @Controller()
  class OpenApiYamlController {
    private documentService = inject(OpenApiDocumentServiceToken)

    @Stream(endpoint)
    @ApiStream({ contentType: 'text/yaml' })
    async getYaml() {
      const yaml = this.documentService.getYamlDocument()

      // Return a Response with proper content-type
      return new Response(yaml, {
        headers: {
          'Content-Type': 'text/yaml; charset=utf-8',
        },
      })
    }
  }

  return OpenApiYamlController
}
