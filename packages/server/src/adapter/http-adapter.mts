import type { LoggerService } from '@navios/core'
import type { Container } from '@navios/di'

import type { AdapterEnvironment } from '../context/environment.mjs'
import type { ErrorPipeline } from '../errors/error-pipeline.mjs'
import type { CompiledRoute, RouteExecutor } from '../routing/compiled-route.mjs'

import type { TestRequest, TestResponse } from './test-request.mjs'

/**
 * What an HTTP adapter contributes to the types of an application.
 */
export interface HttpAdapterEnvironment extends AdapterEnvironment {
  /** The native server, returned by `app.getServer()`. */
  server: unknown
  /** Options accepted by `app.listen()`. */
  listenOptions: unknown
}

/**
 * An HTTP server binding. It registers compiled routes, turns each native
 * request into a `RouteInput`, calls the route's executor and writes the
 * `RouteResponse`. It contains no guard, decoding, validation or error-mapping
 * logic.
 */
export interface HttpAdapter<Env extends HttpAdapterEnvironment = HttpAdapterEnvironment> {
  readonly server: Env['server']
  /** Registers one route. Called for every route before `ready()`. */
  register(route: CompiledRoute): void
  /** Sets the executor for requests that match no route. */
  setNotFound(execute: RouteExecutor): void
  /** Called once after every route has been registered. */
  ready(): Promise<void>
  listen(options: Env['listenOptions']): Promise<string>
  /** Handles a request in process, for tests. */
  inject(request: TestRequest): Promise<TestResponse>
  /**
   * Stops accepting connections and waits for in-flight requests, for at
   * most `timeoutMs`.
   */
  close(timeoutMs: number): Promise<void>
}

export interface AdapterContext {
  container: Container
  logger: LoggerService
  errors: ErrorPipeline
  globalPrefix: string
}

/**
 * How an application obtains its adapter. Adapter packages export a function
 * returning one, for example `defineFastifyEnvironment({ ... })`.
 */
export interface AdapterDefinition<Env extends HttpAdapterEnvironment = HttpAdapterEnvironment> {
  readonly name: string
  create(context: AdapterContext): HttpAdapter<Env> | Promise<HttpAdapter<Env>>
}
