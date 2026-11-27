import {
  definePlugin,
  handler,
  httpTransport,
  inject,
  registerController,
  registerModule,
} from '@navios/server'

import type { FieldHandler, InjectionToken, RequestContext } from '@navios/server'
import type { Auth } from 'better-auth'

import { AllowAnonymous, OpenApiExclude } from './attributes.mjs'
import { BetterAuth } from './better-auth-token.mjs'
import { effectiveBasePath, servedPath } from './internal/base-path.mjs'

export interface BetterAuthPluginOptions {
  /** The token `provideBetterAuth()` returned. */
  auth: InjectionToken<Auth<any>, undefined>
  /**
   * The path Better Auth is served at, relative to the application's prefixes. With the
   * prefixes it has to equal Better Auth's `basePath` (or the path of its `baseURL`); the
   * application does not start otherwise.
   * @default '/api/auth'
   */
  path?: string
}

/** Every method a Better Auth endpoint, or one of its plugins, may have. `HEAD` is `GET`'s. */
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const

/** A path as an endpoint declares it, whatever slashes are around it. */
function toUrl(path: string): string {
  const trimmed = path.replace(/^\/+|\/+$/g, '')
  return trimmed === '' ? '' : `/${trimmed}`
}

/** The request for Better Auth. `HEAD` is served by the `GET` route and asked as `GET`. */
async function authRequest(ctx: RequestContext): Promise<Request> {
  const request = await ctx.toWebRequest()
  if (request.method !== 'HEAD') {
    return request
  }
  // From its parts: a request a server hands on may not take `new Request(request, init)`.
  return new Request(request.url, {
    method: 'GET',
    headers: request.headers,
    signal: request.signal,
  })
}

/**
 * Serves Better Auth in the application: every method on `path/$path*`, a rest param, handed to
 * `auth.handler()`. On Bun and srvx Better Auth gets the request the server received, and its
 * response is sent as it is. The routes are ordinary Navios routes, so they get the
 * application's prefixes and interceptors, and an application route with a fixed path under
 * the same prefix still wins. They carry `AllowAnonymous` and are left out of an OpenAPI
 * document.
 *
 * ```ts
 * const app = await NaviosFactory.create(AppModule, {
 *   adapter: defineBunEnvironment(),
 *   plugins: [betterAuthPlugin({ auth: Auth })],
 * })
 * ```
 */
export const betterAuthPlugin = definePlugin({
  name: 'better-auth',
  setup(api, options: BetterAuthPluginOptions) {
    const http = api.transport(httpTransport)
    if (!http) {
      throw new Error('[Navios] @navios/better-auth needs the HTTP transport.')
    }
    const { auth: token, path = '/api/auth' } = options
    const url = `${toUrl(path)}/$path*`

    api.provide(BetterAuth, { existing: token })

    const attributes = [AllowAnonymous(), OpenApiExclude()]
    // Handlers are fields of the instance, the form core discovers at boot.
    class BetterAuthController {
      constructor() {
        const auth = inject(BetterAuth)
        const fields = this as unknown as Record<string, FieldHandler>
        for (const method of METHODS) {
          fields[method] = handler(
            { config: { method, url, response: 'stream' } },
            { attributes },
            async (_params, ctx) => auth.handler(await authRequest(ctx)),
          ) as FieldHandler
        }
      }
    }
    registerController(BetterAuthController)

    class BetterAuthModule {}
    registerModule(BetterAuthModule, { controllers: [BetterAuthController] })

    api.addModule(BetterAuthModule)

    // The instance is created here, at start-up, so that a wrong configuration stops the start
    // instead of turning every auth call into a 404.
    api.onBootstrap(async () => {
      const auth = await api.container.get(token)
      const served = servedPath(http.routes(), BetterAuthController, 'GET')
      const base = await effectiveBasePath(auth)
      if (served !== base.path) {
        const advice =
          base.source === 'baseURL'
            ? `change the path of \`baseURL\` to "${served}"`
            : `set \`basePath: '${served}'\` in the Better Auth options`
        throw new Error(
          `[Navios] Better Auth is served at "${served}" (the \`path\` of betterAuthPlugin with ` +
            `the application's prefixes), but its base path is "${base.path}". To serve it ` +
            `there, ${advice}, or change the plugin's \`path\`.`,
        )
      }
    })
  },
})
