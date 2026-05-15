import { Token } from '@navios/di'

import type { BunOtelPluginOptions } from '../interfaces/index.mjs'

/**
 * Injection token for Bun OpenTelemetry plugin options.
 *
 * This token provides access to the plugin configuration throughout
 * the application, allowing services to access tracing settings.
 */
export const BunOtelOptionsToken =
  Token.create<BunOtelPluginOptions>('BunOtelOptionsToken')
