import type { StreamParams } from '@navios/core'
import type { ClassType } from '@navios/di'

import { builder } from '@navios/builder'
import { Controller, inject, Stream } from '@navios/core'
import { ApiExclude, ApiStream } from '@navios/openapi'

import { getHtmlDocument } from '@scalar/core/libs/html-rendering'

import type { ScalarOptions } from '../schemas/index.mjs'

import { OpenApiOptionsToken } from '../tokens/openapi-options.token.mjs'

/**
 * Creates a customized Scalar UI controller with the correct path.
 *
 * @param docsPath - The path to serve the Scalar UI (e.g., '/docs')
 * @param jsonPath - The path to the OpenAPI JSON spec (used by Scalar to load the spec)
 * @returns A controller class that serves the Scalar API Reference UI
 */
export function createOpenApiUiController(
  docsPath: string,
  jsonPath: string,
): ClassType {
  const API = builder()

  const endpoint = API.declareStream({
    method: 'GET',
    url: docsPath,
  })

  @ApiExclude()
  @Controller()
  class OpenApiUiController {
    private options = inject(OpenApiOptionsToken)
    private html: string | null = null

    // @ts-expect-error - Stream decorator is not typed correctly
    @Stream(endpoint)
    @ApiStream({ contentType: 'text/html' })
    async getUi(_params: StreamParams<typeof endpoint>) {
      // Generate HTML on first request (lazy initialization)
      if (!this.html) {
        this.html = this.generateHtml()
      }

      return new Response(this.html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
        },
      })
    }

    private generateHtml(): string {
      const scalarOptions: ScalarOptions = this.options.scalar ?? {}

      return getHtmlDocument({
        url: jsonPath,
        theme: scalarOptions.theme ?? 'default',
        favicon: scalarOptions.favicon,
        customCss: scalarOptions.customCss,
        hideDownloadButton: scalarOptions.hideDownloadButton,
        hideSearch: scalarOptions.hideSearch,
        metaData: scalarOptions.metaData,
        cdn: scalarOptions.cdn,
        pageTitle: scalarOptions.metaData?.title ?? 'API Reference',
      })
    }
  }

  return OpenApiUiController
}
