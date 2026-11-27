import { Application } from '@navios/core'

import type { ClassType, GuardClass, InterceptorClass } from '@navios/core'

import type { HttpAdapter, HttpAdapterEnvironment } from '../adapter/http-adapter.mjs'
import type { TestRequest, TestResponse } from '../adapter/test-request.mjs'
import type { ErrorClass, ErrorMapper } from '../errors/error-pipeline.mjs'
import type { RouteInfo } from '../routing/route-info.mjs'

import { httpTransport } from './http-transport.mjs'

import type { HttpTransport } from './http-transport.mjs'
import type {
  ApplicationEnvironment,
  NaviosApplicationOptions,
} from './navios-application-options.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * A Navios application whose main job is HTTP: a module tree compiled into
 * routes and bound to an HTTP adapter. It is an `Application` with an HTTP
 * transport, and the transport's methods are available on it directly.
 */
export class NaviosApplication<
  Env extends HttpAdapterEnvironment = ApplicationEnvironment,
> extends Application {
  private readonly errorMappers: Array<[ErrorClass<any>, ErrorMapper<any>]>
  private readonly routeGuards: GuardClass[]
  private readonly routeInterceptors: InterceptorClass[]

  constructor(appModule: ClassType, options: NaviosApplicationOptions<Env>) {
    const {
      adapter,
      globalPrefix,
      validateResponses,
      exposeErrorDetails,
      clientErrorStacks,
      guards,
      interceptors,
      errorMappers: mappers,
      transports,
      ...applicationOptions
    } = options
    // The transport reads the lists when it needs them, so what is added
    // between construction and init() is seen.
    const errorMappers = (mappers ?? []).map(
      ([errorClass, mapper]): [ErrorClass<any>, ErrorMapper<any>] => [errorClass, mapper],
    )
    const routeGuards: GuardClass[] = [...(guards ?? [])]
    const routeInterceptors: InterceptorClass[] = [...(interceptors ?? [])]
    super(appModule, {
      ...applicationOptions,
      transports: [
        httpTransport({
          adapter,
          globalPrefix,
          validateResponses,
          exposeErrorDetails,
          clientErrorStacks,
          guards: routeGuards,
          errorMappers,
          interceptors: routeInterceptors,
        }),
        ...(transports ?? []),
      ],
    })
    this.errorMappers = errorMappers
    this.routeGuards = routeGuards
    this.routeInterceptors = routeInterceptors
  }

  private get http(): HttpTransport<Env> | undefined {
    return this.findTransport(httpTransport) as HttpTransport<Env> | undefined
  }

  // --------------------------------------------------------------------------
  // Configuration
  // --------------------------------------------------------------------------

  /**
   * Maps an error class to a response. The most specific registered class
   * wins.
   *
   * ```ts
   * app.mapError(UserNotFound, (error) => reply(404, { message: error.message }))
   * ```
   */
  mapError<E>(errorClass: ErrorClass<E>, mapper: ErrorMapper<E>): this {
    const http = this.http
    if (http) {
      http.mapError(errorClass, mapper)
    } else {
      this.errorMappers.push([errorClass, mapper])
    }
    return this
  }

  /**
   * Adds a guard of every route, whichever module it belongs to, after those
   * of the `guards` option. They run before the guards of the module.
   */
  guard(guard: GuardClass): this {
    if (this.http) {
      throw new Error('[Navios] guard() must be called before init()')
    }
    this.routeGuards.push(guard)
    return this
  }

  /** Adds an interceptor around every route, after those of the `interceptors` option. */
  override intercept(interceptor: InterceptorClass): this {
    if (this.http) {
      // Raises the "before init()" error.
      return super.intercept(interceptor)
    }
    this.routeInterceptors.push(interceptor)
    return this
  }

  // --------------------------------------------------------------------------
  // Access
  // --------------------------------------------------------------------------

  get adapter(): HttpAdapter<Env> {
    const http = this.http
    if (!http) {
      throw new Error('[Navios] The adapter is created by init(); call init() first.')
    }
    return http.adapter
  }

  /** The adapter's native server. */
  getServer(): Env['server'] {
    return this.adapter.server
  }

  /** Every route of the application. Available after `init()`. */
  routes(): readonly RouteInfo[] {
    return this.http?.routes() ?? []
  }

  // --------------------------------------------------------------------------
  // Running
  // --------------------------------------------------------------------------

  /**
   * Initialises the application if needed, binds the HTTP server and starts
   * the application's other transports.
   */
  async listen(options: Env['listenOptions']): Promise<string> {
    await this.init()
    // It may have been closed while it was initialising.
    await this.assertStillOpen()
    const address = await this.http!.listen(options)
    await this.start()
    this.logger.log(`Navios is listening on ${address}`)
    return address
  }

  /**
   * Handles a request in process, without a socket. Initialises the
   * application if needed, and starts no transport.
   */
  async inject(request: TestRequest): Promise<TestResponse> {
    await this.init()
    return this.http!.inject(request)
  }
}
