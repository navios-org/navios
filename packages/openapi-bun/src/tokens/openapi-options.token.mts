import { InjectionToken } from '@navios/core'

import type { OpenApiGeneratorOptions } from '@navios/openapi'

import type { BunOpenApiPluginOptionsBase } from '../schemas/index.mjs'

/**
 * Combined options for the Bun OpenAPI plugin.
 * Extends OpenApiGeneratorOptions with Bun-specific settings.
 */
export interface BunOpenApiPluginOptions
  extends OpenApiGeneratorOptions, Partial<BunOpenApiPluginOptionsBase> {}

/**
 * Injection token for OpenAPI plugin options.
 *
 * Controllers inject this to access the plugin configuration
 * (paths, Scalar theme, info, etc.)
 *
 * @example
 * ```typescript
 * @Injectable()
 * class OpenApiJsonController {
 *   private options = inject(OpenApiOptionsToken)
 * }
 * ```
 */
export const OpenApiOptionsToken = InjectionToken.create<BunOpenApiPluginOptions>(
  Symbol.for('BunOpenApiPluginOptions'),
)
