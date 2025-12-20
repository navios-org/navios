import type { ModuleMetadata } from '@navios/core'
import type { oas31 } from 'zod-openapi'

import { inject, Injectable, InjectionToken } from '@navios/core'
import { OpenApiGeneratorService } from '@navios/openapi'

import { stringify as yamlStringify } from 'yaml'

import { OpenApiOptionsToken } from '../tokens/openapi-options.token.mjs'

type OpenAPIObject = oas31.OpenAPIObject

/**
 * Injection token for the document service
 */
export const OpenApiDocumentServiceToken =
  InjectionToken.create<OpenApiDocumentService>(
    Symbol.for('OpenApiDocumentService'),
  )

/**
 * Service that generates and caches the OpenAPI document.
 *
 * The document is generated once during plugin initialization
 * and served by controllers.
 */
@Injectable({
  token: OpenApiDocumentServiceToken,
})
export class OpenApiDocumentService {
  private options = inject(OpenApiOptionsToken)
  private generator = inject(OpenApiGeneratorService)

  private document: OpenAPIObject | null = null
  private yamlDocument: string | null = null

  /**
   * Initializes the document service by generating the OpenAPI document.
   * Called by the plugin during registration.
   *
   * @param modules - All loaded modules with their metadata
   * @param globalPrefix - Global route prefix (e.g., '/api/v1')
   */
  initialize(modules: Map<string, ModuleMetadata>, globalPrefix: string): void {
    // Generate document
    this.document = this.generator.generate(modules, this.options)

    // Apply global prefix to servers if not already set
    if (
      globalPrefix &&
      (!this.document.servers || this.document.servers.length === 0)
    ) {
      this.document.servers = [{ url: globalPrefix }]
    }

    // Pre-generate YAML
    this.yamlDocument = yamlStringify(this.document)
  }

  /**
   * Returns the OpenAPI document as JSON-serializable object.
   */
  getDocument(): OpenAPIObject {
    if (!this.document) {
      throw new Error(
        'OpenApiDocumentService not initialized. Call initialize() first.',
      )
    }
    return this.document
  }

  /**
   * Returns the OpenAPI document as YAML string.
   */
  getYamlDocument(): string {
    if (!this.yamlDocument) {
      throw new Error(
        'OpenApiDocumentService not initialized. Call initialize() first.',
      )
    }
    return this.yamlDocument
  }
}
