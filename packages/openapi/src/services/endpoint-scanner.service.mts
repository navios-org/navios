import type {
  ControllerMetadata,
  HandlerMetadata,
  ModuleMetadata,
} from '@navios/core'
import type { BaseEndpointConfig } from '@navios/builder'

import { extractControllerMetadata, inject, Injectable, Logger } from '@navios/core'

import type { OpenApiEndpointMetadata } from '../metadata/openapi.metadata.mjs'

import { MetadataExtractorService } from './metadata-extractor.service.mjs'

/**
 * Represents a discovered endpoint with all its metadata
 */
export interface DiscoveredEndpoint {
  /** Module metadata */
  module: ModuleMetadata
  /** Controller class */
  controllerClass: any
  /** Controller metadata */
  controller: ControllerMetadata
  /** Handler (endpoint) metadata */
  handler: HandlerMetadata<any>
  /** Endpoint configuration from @navios/builder */
  config: BaseEndpointConfig
  /** Extracted OpenAPI metadata */
  openApiMetadata: OpenApiEndpointMetadata
}

/**
 * Service responsible for scanning modules and discovering endpoints.
 *
 * Iterates through all modules, controllers, and endpoints,
 * extracting OpenAPI metadata from decorators.
 */
@Injectable()
export class EndpointScannerService {
  private readonly logger = inject(Logger, {
    context: EndpointScannerService.name,
  })

  private readonly metadataExtractor = inject(MetadataExtractorService)

  /**
   * Scans all loaded modules and discovers endpoints.
   *
   * @param modules - Map of loaded modules from NaviosApplication
   * @returns Array of discovered endpoints
   */
  scan(modules: Map<string, ModuleMetadata>): DiscoveredEndpoint[] {
    const endpoints: DiscoveredEndpoint[] = []

    for (const [moduleName, moduleMetadata] of modules) {
      if (!moduleMetadata.controllers || moduleMetadata.controllers.size === 0) {
        continue
      }

      this.logger.debug(`Scanning module: ${moduleName}`)

      for (const controllerClass of moduleMetadata.controllers) {
        const controllerMeta = extractControllerMetadata(controllerClass)
        const controllerEndpoints = this.scanController(
          moduleMetadata,
          controllerClass,
          controllerMeta,
        )
        endpoints.push(...controllerEndpoints)
      }
    }

    this.logger.debug(`Discovered ${endpoints.length} endpoints`)
    return endpoints
  }

  /**
   * Scans a controller and returns its endpoints
   */
  private scanController(
    module: ModuleMetadata,
    controllerClass: any,
    controllerMeta: ControllerMetadata,
  ): DiscoveredEndpoint[] {
    const endpoints: DiscoveredEndpoint[] = []

    for (const handler of controllerMeta.endpoints) {
      // Skip endpoints without config (non-builder endpoints)
      if (!handler.config) {
        continue
      }

      const openApiMetadata = this.metadataExtractor.extract(
        controllerMeta,
        handler,
      )

      // Skip excluded endpoints
      if (openApiMetadata.excluded) {
        this.logger.debug(
          `Skipping excluded endpoint: ${handler.classMethod}`,
        )
        continue
      }

      endpoints.push({
        module,
        controllerClass,
        controller: controllerMeta,
        handler,
        config: handler.config as BaseEndpointConfig,
        openApiMetadata,
      })
    }

    return endpoints
  }
}
