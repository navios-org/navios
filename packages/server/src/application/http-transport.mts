import { defineTransport, settledWithin } from '@navios/core/transport'

import type { Transport } from '@navios/core'
import type { ModuleNode } from '@navios/core/transport'
import type { TransportHost } from '@navios/core/transport'

import { LiveRequests } from '../context/live-requests.mjs'
import { isRequestValueClass } from '../context/request-value.mjs'
import { useClientErrorStacks } from '../errors/client-error-stacks.mjs'
import { ErrorPipeline } from '../errors/error-pipeline.mjs'
import {
  ForbiddenResponderToken,
  InternalServerErrorResponderToken,
  NotFoundResponderToken,
  ValidationErrorResponderToken,
} from '../errors/error-responders.mjs'
import { encodeResult } from '../pipeline/encode-result.mjs'
import { joinPaths } from '../routing/join-paths.mjs'
import { RouteTable } from '../routing/route-table.mjs'

import type { CompiledRoute, RouteExecutor } from '../adapter/compiled-route.mjs'
import type {
  AdapterDefinition,
  HttpAdapter,
  HttpAdapterEnvironment,
} from '../adapter/http-adapter.mjs'
import type { TestRequest, TestResponse } from '../adapter/test-request.mjs'
import type { ClientErrorStacks } from '../errors/client-error-stacks.mjs'
import type { ErrorClass, ErrorMapper } from '../errors/error-pipeline.mjs'
import type { ResponseEncoder } from '../pipeline/response-encoder.mjs'
import type { HttpGuardClass, HttpInterceptorClass } from '../routing/http-contracts.mjs'
import type { RouteInfo } from '../routing/route-info.mjs'

import { assembleRoutes } from './assemble-routes.mjs'
import { moduleRequestValues } from './http-module-options.mjs'
import { computeModulePrefixes } from './module-prefixes.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * How long `stop()` waits for requests to release what they hold. Their
 * lazy bodies get a second to close, and the rest comes after that.
 */
const RELEASE_TIMEOUT_MS = 2000

export interface HttpTransportOptions<Env extends HttpAdapterEnvironment = HttpAdapterEnvironment> {
  adapter: AdapterDefinition<Env>
  /** When given, the application's `start()` listens with these. */
  listen?: Env['listenOptions']
  /** Prefix for every route. */
  globalPrefix?: string
  /**
   * Whether handler results are validated against the declared schema, which
   * also removes the fields it does not declare. There is no setting that
   * differs between environments: what development strips, production would
   * send.
   * @default 'always'
   */
  validateResponses?: 'always' | 'never'
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
  /** Error mappers to start with; `mapError` adds more later. */
  errorMappers?: ReadonlyArray<readonly [ErrorClass<any>, ErrorMapper<any>]>
  /**
   * Guards of every route, whichever module it belongs to: those of modules
   * that plugins add as well. They run before the guards of the module.
   */
  guards?: readonly HttpGuardClass[]
  /**
   * Interceptors around every route and nothing else, outermost first, inside
   * the application-wide ones. Read when the routes are compiled.
   */
  interceptors?: readonly HttpInterceptorClass[]
}

/**
 * The HTTP side of an application: its adapter and its routes.
 */
export interface HttpTransport<
  Env extends HttpAdapterEnvironment = HttpAdapterEnvironment,
> extends Transport {
  readonly adapter: HttpAdapter<Env>
  /** The adapter's native server. */
  readonly server: Env['server']
  /** Every route. Available once the application is initialised. */
  routes(): readonly RouteInfo[]
  /** Binds the server. A second call returns the address of the first. */
  listen(options: Env['listenOptions']): Promise<string>
  /** Handles a request in process, without a socket. */
  inject(request: TestRequest): Promise<TestResponse>
  /** Maps an error class to a response. The most specific registered class wins. */
  mapError<E>(errorClass: ErrorClass<E>, mapper: ErrorMapper<E>): void
  /** Registers an encoder for a custom response kind. Before routes are compiled. */
  encoder(kind: string, encoder: ResponseEncoder): void
  /**
   * Adds an interceptor around every route, inside the application-wide
   * ones, and around nothing else. Before routes are compiled.
   */
  intercept(interceptor: HttpInterceptorClass): void
}

function tokenName(token: unknown): string {
  return typeof token === 'function' ? token.name : String(token)
}

async function createHttpTransport(
  host: TransportHost,
  options: HttpTransportOptions<any>,
): Promise<HttpTransport<any>> {
  const { container, logger } = host
  const releaseClientErrorStacks = useClientErrorStacks(options.clientErrorStacks ?? 'development')
  try {
    const errors = new ErrorPipeline({
      notFound: await container.get(NotFoundResponderToken),
      forbidden: await container.get(ForbiddenResponderToken),
      validation: await container.get(ValidationErrorResponderToken),
      internal: await container.get(InternalServerErrorResponderToken),
      exposeErrorDetails: options.exposeErrorDetails ?? false,
      onUnhandled: (error, at) => {
        logger.error(at ? `Unhandled error in ${at.method} ${at.path}` : 'Unhandled error', error)
      },
    })
    for (const [errorClass, mapper] of options.errorMappers ?? []) {
      errors.add(errorClass, mapper)
    }
    const globalPrefix = joinPaths(options.globalPrefix ?? '')
    const adapter: HttpAdapter<any> = await options.adapter.create({
      container,
      logger,
      errors,
      globalPrefix,
    })

    const encoders = new Map<string, ResponseEncoder>()
    const interceptors: HttpInterceptorClass[] = []
    const table = new RouteTable<CompiledRoute>()
    /** The requests that hold something: until it is released, or the transport stops. */
    const live = new LiveRequests()
    let compiled: CompiledRoute[] = []
    let isSetUp = false
    let isStopped = false
    let listening: Promise<string> | null = null

    const assertBeforeSetup = (what: string) => {
      if (isSetUp) {
        throw new Error(`[Navios] ${what} must be called before the routes are compiled`)
      }
    }

    const assertRunning = () => {
      if (isStopped) {
        throw new Error('[Navios] The application is closed.')
      }
    }

    const allowedMethods = (path: string): string[] => {
      try {
        return table.methods(path)
      } catch {
        // The path is not valid percent-encoding.
        return []
      }
    }

    const notFound: RouteExecutor = (input) => {
      try {
        const { method, path } = input
        const allowed = allowedMethods(path)
        return encodeResult(
          allowed.length > 0 && !allowed.includes(method)
            ? errors.methodNotAllowed(method, path, allowed)
            : errors.notFound(`Route [${method}] ${path} not found`, input),
        )
      } catch (defect) {
        return errors.unexpected(defect, input)
      }
    }

    const listen = async (listenOptions: unknown): Promise<string> => {
      assertRunning()
      listening ??= adapter.listen(listenOptions).catch((error: unknown) => {
        // A failed bind is not remembered: the caller may try another port.
        listening = null
        throw error
      })
      return listening
    }

    return {
      adapter,
      get server() {
        return adapter.server
      },
      routes: () => compiled.map((route) => route.info),
      listen,
      async inject(request) {
        assertRunning()
        return adapter.inject(request)
      },
      mapError: (errorClass, mapper) => errors.add(errorClass, mapper),
      encoder(kind, encoder) {
        assertBeforeSetup('encoder()')
        encoders.set(kind, encoder)
      },
      intercept(interceptor) {
        assertBeforeSetup('intercept()')
        interceptors.push(interceptor)
      },

      async setup(graph: readonly ModuleNode[]) {
        isSetUp = true
        for (const node of graph) {
          for (const requestValue of moduleRequestValues(node)) {
            if (!isRequestValueClass(requestValue)) {
              throw new Error(
                `[Navios] Module ${node.module.name} lists ${tokenName(requestValue)} in requestValues, ` +
                  `but ${tokenName(requestValue)} is not a request value. Decorate it with @RequestValue().`,
              )
            }
            await container.get(requestValue)
          }
        }
        compiled = await assembleRoutes(graph, {
          container,
          prefixes: computeModulePrefixes(graph, globalPrefix),
          globalGuards: [...(options.guards ?? [])],
          globalInterceptors: [
            ...host.interceptors,
            ...(options.interceptors ?? []),
            ...interceptors,
          ],
          compile: {
            host: host.contextHost,
            errors,
            validateResponses: options.validateResponses !== 'never',
            asyncContext: host.asyncContext,
            encoders,
            live,
          },
          notFound,
        })
        for (const route of compiled) {
          table.add(route.info.method, route.path, route)
          adapter.register(route)
        }
        adapter.setNotFound(notFound)
        await adapter.ready()
        logger.debug?.(`HTTP transport set up with ${compiled.length} route(s)`)
      },

      async start() {
        if (options.listen !== undefined && listening === null) {
          const address = await listen(options.listen)
          logger.log(`Navios is listening on ${address}`)
        }
      },

      async stop(timeoutMs: number) {
        isStopped = true
        try {
          await adapter.close(timeoutMs)
        } finally {
          // The container is disposed next. What the last responses still
          // release, and what a request that outlived the timeout holds, comes
          // before that.
          const releasing = Array.from(live, (ctx) => ctx.release())
          if (releasing.length > 0) {
            await settledWithin(Promise.all(releasing), RELEASE_TIMEOUT_MS)
          }
          releaseClientErrorStacks()
        }
      },
    }
  } catch (error) {
    releaseClientErrorStacks()
    throw error
  }
}

/**
 * Serves the application's controllers over HTTP through an adapter.
 *
 * ```ts
 * const app = createApplication(AppModule, {
 *   transports: [httpTransport({ adapter: defineFastifyEnvironment(), listen: { port: 3000 } })],
 * })
 * await app.start()
 * ```
 *
 * `NaviosFactory.create` builds exactly this, for an application whose main
 * job is HTTP. An application has one HTTP transport.
 */
export const httpTransport = defineTransport<HttpTransportOptions<any>, HttpTransport<any>>({
  name: 'http',
  create: createHttpTransport,
})
