import type { ModuleMetadata } from '@navios/core'
import type { oas31 } from 'zod-openapi'

import { inject, Injectable, Logger } from '@navios/core'

import type { DiscoveredEndpoint } from './endpoint-scanner.service.mjs'

import { EndpointScannerService } from './endpoint-scanner.service.mjs'
import { PathBuilderService } from './path-builder.service.mjs'

type OpenAPIObject = oas31.OpenAPIObject
type PathsObject = oas31.PathsObject
type SecuritySchemeObject = oas31.SecuritySchemeObject
type TagObject = oas31.TagObject

/**
 * Options for generating the OpenAPI document
 */
export interface OpenApiGeneratorOptions {
  /**
   * OpenAPI document info
   */
  info: {
    title: string
    version: string
    description?: string
    termsOfService?: string
    contact?: {
      name?: string
      url?: string
      email?: string
    }
    license?: {
      name: string
      url?: string
    }
  }

  /**
   * External documentation
   */
  externalDocs?: {
    url: string
    description?: string
  }

  /**
   * Server definitions
   */
  servers?: Array<{
    url: string
    description?: string
    variables?: Record<
      string,
      {
        default: string
        enum?: string[]
        description?: string
      }
    >
  }>

  /**
   * Security scheme definitions
   */
  securitySchemes?: Record<string, SecuritySchemeObject>

  /**
   * Global security requirements
   */
  security?: Array<Record<string, string[]>>

  /**
   * Tag definitions with descriptions
   */
  tags?: TagObject[]
}

/**
 * Service responsible for generating the complete OpenAPI document.
 *
 * Orchestrates endpoint discovery, path generation, and document assembly.
 */
@Injectable()
export class OpenApiGeneratorService {
  private readonly logger = inject(Logger, {
    context: OpenApiGeneratorService.name,
  })

  private readonly scanner = inject(EndpointScannerService)
  private readonly pathBuilder = inject(PathBuilderService)

  /**
   * Generates an OpenAPI document from loaded modules.
   *
   * @param modules - Map of loaded modules
   * @param options - OpenAPI generation options
   * @returns Complete OpenAPI document
   */
  generate(
    modules: Map<string, ModuleMetadata>,
    options: OpenApiGeneratorOptions,
  ): OpenAPIObject {
    this.logger.debug('Generating OpenAPI document')

    // Discover all endpoints
    const endpoints = this.scanner.scan(modules)

    // Generate paths
    const paths = this.buildPaths(endpoints)

    // Collect unique tags from endpoints
    const discoveredTags = this.collectTags(endpoints)

    // Merge discovered tags with configured tags
    const tags = this.mergeTags(discoveredTags, options.tags)

    // Build the OpenAPI document
    const document: OpenAPIObject = {
      openapi: '3.1.0',
      info: options.info,
      paths,
    }

    // Add optional fields
    if (options.servers && options.servers.length > 0) {
      document.servers = options.servers
    }

    if (options.externalDocs) {
      document.externalDocs = options.externalDocs
    }

    if (tags.length > 0) {
      document.tags = tags
    }

    if (options.security) {
      document.security = options.security
    }

    if (options.securitySchemes) {
      document.components = {
        ...document.components,
        securitySchemes: options.securitySchemes,
      }
    }

    this.logger.debug(
      `Generated OpenAPI document with ${Object.keys(paths).length} paths`,
    )

    return document
  }

  /**
   * Builds paths object from discovered endpoints
   */
  private buildPaths(endpoints: DiscoveredEndpoint[]): PathsObject {
    const paths: PathsObject = {}

    for (const endpoint of endpoints) {
      const { path, pathItem } = this.pathBuilder.build(endpoint)

      // Merge with existing path if methods differ
      if (paths[path]) {
        paths[path] = {
          ...paths[path],
          ...pathItem,
        }
      } else {
        paths[path] = pathItem
      }
    }

    return paths
  }

  /**
   * Collects unique tags from endpoints
   */
  private collectTags(endpoints: DiscoveredEndpoint[]): Set<string> {
    const tags = new Set<string>()

    for (const endpoint of endpoints) {
      for (const tag of endpoint.openApiMetadata.tags) {
        tags.add(tag)
      }
    }

    return tags
  }

  /**
   * Merges discovered tags with configured tags
   */
  private mergeTags(
    discoveredTags: Set<string>,
    configuredTags?: TagObject[],
  ): TagObject[] {
    const tagMap = new Map<string, TagObject>()

    // Add configured tags first (they have descriptions)
    if (configuredTags) {
      for (const tag of configuredTags) {
        tagMap.set(tag.name, tag)
      }
    }

    // Add discovered tags that aren't already configured
    for (const tagName of discoveredTags) {
      if (!tagMap.has(tagName)) {
        tagMap.set(tagName, { name: tagName })
      }
    }

    return Array.from(tagMap.values())
  }
}
