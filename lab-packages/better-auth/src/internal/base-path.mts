import type { RouteInfo } from '@navios/server'
import type { Auth } from 'better-auth'

/** A path with one leading slash and no trailing one; the root is `/`. */
export function normalizePath(path: string): string {
  const trimmed = path.replace(/^\/+|\/+$/g, '')
  return `/${trimmed}`
}

export interface BasePath {
  path: string
  /** Where it comes from, for the advice of an error message. */
  source: 'baseURL' | 'basePath'
}

/** The base URL Better Auth was given: its option, or `BETTER_AUTH_URL`. */
function configuredBaseURL(auth: Auth<any>): string | undefined {
  const { baseURL } = auth.options
  if (typeof baseURL === 'string') {
    return baseURL
  }
  return (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
    ?.BETTER_AUTH_URL
}

/**
 * The path Better Auth routes under: that of its base URL, `$context.baseURL`, which is the
 * configured URL with `basePath` appended when the URL has no path of its own. It is empty when
 * the base URL is derived per request; `basePath` counts then.
 */
export async function effectiveBasePath(auth: Auth<any>): Promise<BasePath> {
  const context = await auth.$context
  const configured = configuredBaseURL(auth)
  const source =
    configured !== undefined &&
    URL.canParse(configured) &&
    normalizePath(new URL(configured).pathname) !== '/'
      ? 'baseURL'
      : 'basePath'
  if (context.baseURL) {
    return { path: normalizePath(new URL(context.baseURL).pathname), source }
  }
  return { path: normalizePath(context.options.basePath ?? '/api/auth'), source }
}

/** The path the plugin's routes are served at, prefixes included, read from one of its routes. */
export function servedPath(routes: readonly RouteInfo[], controller: unknown, handlerName: string) {
  const route = routes.find(
    (candidate) => candidate.controller === controller && candidate.handlerName === handlerName,
  )
  if (route === undefined) {
    throw new Error(`[Navios] betterAuthPlugin: its route ${handlerName} is missing.`)
  }
  return normalizePath(route.path.slice(0, route.path.lastIndexOf('/')))
}
