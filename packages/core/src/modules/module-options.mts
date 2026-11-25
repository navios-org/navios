import type { ClassType, Provider } from '@navios/di'

import type { AttributeValue } from '../attributes/attribute-value.mjs'
import type { GuardClass } from '../guards/guard.mjs'
import type { InterceptorClass } from '../interceptors/interceptor.mjs'

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
  guards?: GuardClass[]
  /** Interceptors around the same handlers, the first one outermost. */
  interceptors?: InterceptorClass[]
  /**
   * Attribute values for every handler of this module and of the modules it
   * imports: `[Public()]`. A handler whose module is imported by several others
   * has to get one value from all of them, unless it, its class or the module
   * sets its own.
   */
  attributes?: AttributeValue[]
}
