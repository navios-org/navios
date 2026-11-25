import type { Container, Provider } from '@navios/di'

import type { AdapterDefinition, HttpAdapterEnvironment } from '../adapter/http-adapter.mjs'
import type { RegisteredEnvironment } from '../context/environment.mjs'
import type { ClientErrorStacks } from '../errors/client-error-stacks.mjs'
import type { LogLevel } from '../logger/log-levels.mjs'
import type { LoggerService } from '../logger/logger-output.mjs'
import type { PluginInstance } from '../plugins/plugin.mjs'

/**
 * The environment of the adapter registered through `Register`, or any HTTP
 * adapter's when none is registered.
 * @internal
 */
export type ApplicationEnvironment = RegisteredEnvironment extends HttpAdapterEnvironment
  ? RegisteredEnvironment
  : HttpAdapterEnvironment

export interface NaviosApplicationOptions<
  Env extends HttpAdapterEnvironment = ApplicationEnvironment,
> {
  adapter: AdapterDefinition<Env>
  /** Providers that replace or supply defaults, application-wide. */
  providers?: Provider[]
  plugins?: PluginInstance[]
  /** Use an existing container instead of creating one. */
  container?: Container
  /**
   * `false` disables logging, an array selects the console logger's levels,
   * and an object is used as the logger.
   */
  logger?: LoggerService | LogLevel[] | false
  /** Prefix for every route. */
  globalPrefix?: string
  /**
   * When handler results are validated against the declared schema.
   * `'development'` validates unless `NODE_ENV` is `production`.
   * @default 'always'
   */
  validateResponses?: 'always' | 'development' | 'never'
  /** Send the message of unexpected errors to the client. @default false */
  exposeErrorDetails?: boolean
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
}
