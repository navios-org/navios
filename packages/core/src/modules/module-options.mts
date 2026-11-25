import type { ClassType, Provider } from '@navios/di'

import type { AttributeValue } from '../attributes/attribute-value.mjs'

/**
 * What `@Module` accepts in every application. A transport adds its own
 * options on top; `@Module` keeps an option it does not know as written, for
 * the transport that reads it, and an option that no transport of the running
 * application reads is ignored. One module can therefore serve several
 * transports.
 */
export interface ModuleOptions {
  imports?: ClassType[]
  /** Providers for the whole application (modules do not encapsulate them). */
  providers?: Provider[]
  /** Guards for every handler of this module and of the modules it imports. */
  guards?: ClassType[]
  interceptors?: ClassType[]
  /** Attribute values for every handler of this module: `[Public()]`. */
  attributes?: AttributeValue[]
}
