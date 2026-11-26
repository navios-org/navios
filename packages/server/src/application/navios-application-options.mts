import type { ApplicationOptions } from '@navios/core'

import type { HttpAdapterEnvironment } from '../adapter/http-adapter.mjs'
import type { RegisteredEnvironment } from '../context/environment.mjs'

import type { HttpTransportOptions } from './http-transport.mjs'

/**
 * The environment of the adapter registered through `Register`, or any HTTP
 * adapter's when none is registered.
 */
export type ApplicationEnvironment = RegisteredEnvironment extends HttpAdapterEnvironment
  ? RegisteredEnvironment
  : HttpAdapterEnvironment

/**
 * Options of an HTTP application: the application's own, and those of its
 * HTTP transport. `transports` are the transports beside HTTP; they share the
 * application's modules and container, and `listen()` starts them.
 */
export interface NaviosApplicationOptions<
  Env extends HttpAdapterEnvironment = ApplicationEnvironment,
>
  extends
    ApplicationOptions,
    Omit<HttpTransportOptions<Env>, 'listen' | 'errorMappers' | 'interceptors'> {}
