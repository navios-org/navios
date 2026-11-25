import { defineTransport } from '@navios/core/transport'

import type { Transport } from '@navios/core'
import type { ModuleNode } from '@navios/core/transport'
import type { TransportHost } from '@navios/core/transport'
import type { ClassType } from '@navios/di'

import { isRequestValueClass } from '../context/request-value.mjs'
import { useClientErrorStacks } from '../errors/client-error-stacks.mjs'
import { ErrorPipeline } from '../errors/error-pipeline.mjs'
import {
  ForbiddenResponderToken,
  InternalServerErrorResponderToken,
  NotFoundResponderToken,
  ValidationErrorResponderToken,
} from '../errors/error-responders.mjs'
import { joinPaths } from '../routing/join-paths.mjs'

import type {
  AdapterDefinition,
  HttpAdapter,
  HttpAdapterEnvironment,
} from '../adapter/http-adapter.mjs'
import type { TestRequest, TestResponse } from '../adapter/test-request.mjs'
import type { ClientErrorStacks } from '../errors/client-error-stacks.mjs'
import type { ErrorClass, ErrorMapper } from '../errors/error-pipeline.mjs'
import type { ResponseEncoder } from '../pipeline/response-encoder.mjs'
import type { CompiledRoute } from '../routing/compiled-route.mjs'
import type { RouteInfo } from '../routing/route-info.mjs'

import { assembleRoutes } from './assemble-routes.mjs'
import { moduleRequestValues } from './http-module-options.mjs'
import { computeModulePrefixes } from './module-prefixes.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface HttpTransportOptions<Env extends HttpAdapterEnvironment = HttpAdapterEnvironment> {
  adapter: AdapterDefinition<Env>
  /** When given, the application's `start()` listens with these. */
  listen?: Env['listenOptions']
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
   * When errors that are answered with a 4xx status capture a stack.
   * @default 'development'
   */
  clientErrorStacks?: ClientErrorStacks
  /** Error mappers to start with; `mapError` adds more later. */
  errorMappers?: ReadonlyArray<readonly [ErrorClass<any>, ErrorMapper<any>]>
  /**
   * Interceptors around every route and nothing else, outermost first, inside
   * the application-wide ones. Read when the routes are compiled.
   */
  interceptors?: readonly ClassType[]
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
  intercept(interceptor: ClassType): void
}

function tokenName(token: unknown): string {
  return typeof token === 'function' ? token.name : String(token)
}

function resolveValidateResponses(mode: HttpTransportOptions['validateResponses']): boolean {
  switch (mode ?? 'always') {
    case 'never':
      return false
    case 'development':
      return process.env.NODE_ENV !== 'production'
    default:
      return true
  }
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
      checkDeclaredErrors: process.env.NODE_ENV !== 'production',
      onUnhandled: (error, ctx) => {
        logger.error(
          ctx ? `Unhandled error in ${ctx.method} ${ctx.path}` : 'Unhandled error',
          error,
        )
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
    const interceptors: ClassType[] = []
    let compiled: CompiledRoute[] = []
    let isSetUp = false
    let listening: Promise<string> | null = null

    const assertBeforeSetup = (what: string) => {
      if (isSetUp) {
        throw new Error(`[Navios] ${what} must be called before the routes are compiled`)
      }
    }

    const listen = (listenOptions: unknown): Promise<string> =>
      (listening ??= adapter.listen(listenOptions).catch((error: unknown) => {
        // A failed bind is not remembered: the caller may try another port.
        listening = null
        throw error
      }))

    return {
      adapter,
      get server() {
        return adapter.server
      },
      routes: () => compiled.map((route) => route.info),
      listen,
      inject: (request) => adapter.inject(request),
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
          globalInterceptors: [
            ...host.interceptors,
            ...(options.interceptors ?? []),
            ...interceptors,
          ],
          compile: {
            host: host.contextHost,
            errors,
            validateResponses: resolveValidateResponses(options.validateResponses),
            asyncContext: host.asyncContext,
            encoders,
          },
        })
        for (const route of compiled) {
          adapter.register(route)
        }
        adapter.setNotFound((input) =>
          errors.notFound(`Route [${input.method}] ${input.path} not found`),
        )
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
        try {
          await adapter.close(timeoutMs)
        } finally {
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
 * job is HTTP.
 */
export const httpTransport = defineTransport<HttpTransportOptions<any>, HttpTransport<any>>({
  name: 'http',
  create: createHttpTransport,
})
