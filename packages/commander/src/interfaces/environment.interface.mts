import type { AdapterEnvironment } from '@navios/core'

import type { AbstractCliAdapterInterface } from './abstract-cli-adapter.interface.mjs'

/**
 * Options for configuring the CLI adapter.
 *
 * @public
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface CliAdapterOptions {
  // Reserved for future options
}

/**
 * Environment type definition for CLI adapters.
 * Used with NaviosFactory.create<CliEnvironment>() for type-safe CLI applications.
 *
 * @public
 *
 * @example
 * ```typescript
 * import { NaviosFactory } from '@navios/core'
 * import { defineCliEnvironment, type CliEnvironment } from '@navios/commander'
 *
 * const app = await NaviosFactory.create<CliEnvironment>(AppModule, {
 *   adapter: defineCliEnvironment(),
 * })
 * ```
 */
export interface CliEnvironment extends AdapterEnvironment {
  options: CliAdapterOptions
  adapter: AbstractCliAdapterInterface
}
