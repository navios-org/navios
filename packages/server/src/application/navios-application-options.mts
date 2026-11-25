import type { ApplicationOptions, TransportInstance } from '@navios/core'

import type { HttpAdapterEnvironment } from '../adapter/http-adapter.mjs'
import type { RegisteredEnvironment } from '../context/environment.mjs'
import type { ClientErrorStacks } from '../errors/client-error-stacks.mjs'

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
 * HTTP transport.
 */
export interface NaviosApplicationOptions<
  Env extends HttpAdapterEnvironment = ApplicationEnvironment,
>
  extends
    ApplicationOptions,
    Omit<HttpTransportOptions<Env>, 'listen' | 'errorMappers' | 'interceptors'> {
  /**
   * When errors that are answered with a 4xx status capture a stack: an
   * `HttpException` below 500, a denied guard, a request that does not match
   * its schema. Capturing one costs more than the rest of the pipeline, and
   * nothing in the framework reads it. `'development'` captures unless
   * `NODE_ENV` is `production`. Other errors always have their stack.
   *
   * The choice applies to the process while the application runs: with
   * several applications, stacks are captured if any of them wants them.
   * @default 'development'
   */
  clientErrorStacks?: ClientErrorStacks
  /**
   * Keep the current `RequestContext` in an `AsyncLocalStorage`, so that
   * `currentContext()` works in code that cannot receive it as an argument.
   * @default false
   */
  asyncContext?: boolean
  /**
   * What happens the first time a handler uses a request-scoped service
   * through `ctx.use()` / `ctx.resolve()`. Request values are the cheaper
   * home for per-request data.
   * @default 'warn' outside production, 'allow' in production
   */
  requestScopedServices?: 'allow' | 'warn' | 'forbid'
  /** How long `close()` waits for in-flight requests, in milliseconds. @default 10000 */
  shutdownTimeout?: number
  /**
   * Transports beside HTTP: queue consumers, a command line. They share the
   * application's modules and container, and `listen()` starts them.
   */
  transports?: TransportInstance[]
}
