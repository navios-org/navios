import type { AnyInjectableType, InjectionToken } from '@navios/core'

import { AdapterToken } from '@navios/core'

import { CommanderAdapterService } from './services/commander-adapter.service.mjs'
import { CommandRegistryService } from './services/command-registry.service.mjs'
import { CliParserService } from './services/cli-parser.service.mjs'

/**
 * Defines the CLI environment configuration for use with NaviosFactory.
 *
 * This function returns the token mappings needed to configure a CLI application.
 * Use it with `NaviosFactory.create()` to create a CLI application.
 *
 * @returns Environment configuration with token mappings
 *
 * @example
 * ```typescript
 * import { NaviosFactory } from '@navios/core'
 * import { defineCliEnvironment, type CliEnvironment } from '@navios/commander'
 *
 * const app = await NaviosFactory.create<CliEnvironment>(AppModule, {
 *   adapter: defineCliEnvironment(),
 * })
 * await app.init()
 *
 * const adapter = app.getAdapter() as AbstractCliAdapterInterface
 * await adapter.run(process.argv)
 * ```
 */
export function defineCliEnvironment() {
  const tokens = new Map<InjectionToken<any, undefined>, AnyInjectableType>([
    [AdapterToken, CommanderAdapterService],
  ])
  return { tokens }
}

// Re-export services for direct access if needed
export { CommanderAdapterService, CommandRegistryService, CliParserService }
