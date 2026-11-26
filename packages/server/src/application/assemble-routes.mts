import { handlerChain, resolveChain } from '@navios/core/transport'

import type { ModuleNode } from '@navios/core/transport'
import type { ClassType, Container } from '@navios/di'

import { getControllerMetadata } from '../controllers/controller-metadata.mjs'
import { memberEndpoint } from '../handlers/endpoint-declaration.mjs'
import { isFieldHandler } from '../handlers/handler.mjs'
import { compileRoute } from '../pipeline/compile-route.mjs'
import { compileRoutePath, isUnmatchable } from '../routing/route-path.mjs'

import type { RequestContext } from '../context/request-context.mjs'
import type { ControllerMetadata } from '../controllers/controller-metadata.mjs'
import type { CompileOptions, RouteDefinition } from '../pipeline/compile-route.mjs'
import type { CompiledRoute, RouteExecutor } from '../routing/compiled-route.mjs'
import type { RouteEndpointConfig } from '../routing/endpoint-config.mjs'
import type { RouteInfo } from '../routing/route-info.mjs'
import type { RoutePath } from '../routing/route-path.mjs'
import type { RouteResult } from '../routing/route-result.mjs'

import { moduleControllers } from './http-module-options.mjs'

/**
 * What route assembly needs of the application.
 * @internal
 */
export interface RouteAssemblyOptions {
  container: Container
  /** Each module's route prefix, from `computeModulePrefixes`. */
  prefixes: ReadonlyMap<ClassType, string>
  /** Guards of every route, before those of its module. */
  globalGuards: ClassType[]
  /** Interceptors around every route, outermost first. */
  globalInterceptors: ClassType[]
  /** Passed to the compiler of every route. */
  compile: CompileOptions
  /** Answers a request that a router took for one of a route and that is not. */
  notFound: RouteExecutor
}

/**
 * Turns the module graph into compiled routes: one for every handler of every
 * controller, in the order of the graph, with the guards, interceptors and
 * attributes of its module, controller and handler.
 * @internal
 */
export async function assembleRoutes(
  graph: readonly ModuleNode[],
  options: RouteAssemblyOptions,
): Promise<CompiledRoute[]> {
  const { container, globalGuards, globalInterceptors } = options
  const compiled: CompiledRoute[] = []
  const taken = new Map<string, string>()

  for (const node of graph) {
    const prefix = options.prefixes.get(node.module) ?? ''
    for (const controllerClass of moduleControllers(node)) {
      const metadata = getControllerMetadata(controllerClass)
      const controller = (await container.get(controllerClass)) as Record<string, unknown>

      for (const draft of collectHandlers(controllerClass, metadata, controller)) {
        const chain = handlerChain({
          application: globalInterceptors,
          node: { ...node, guards: [...globalGuards, ...node.guards] },
          controller: controllerClass,
          owner: metadata,
          handlerName: draft.name,
          member: draft,
        })
        const where = `${controllerClass.name}.${draft.name}`
        const method = draft.config.method.toUpperCase()
        const { path, compiledPath } = routePath(prefix, draft.config.url, where)
        const key = `${method} ${JSON.stringify(
          compiledPath.segments.map((segment) => ('param' in segment ? null : segment.literal)),
        )}`
        const existing = taken.get(key)
        if (existing) {
          throw new Error(`[Navios] ${method} ${path} is served by both ${existing} and ${where}.`)
        }
        taken.set(key, where)

        const info: RouteInfo = { method, path, endpoint: draft.config, ...chain.info }
        const resolved = await resolveChain<RequestContext, RouteResult>(container, chain)
        const definition: RouteDefinition = {
          info,
          path: compiledPath,
          invoke: draft.invoke,
          guards: resolved.guards.map(({ guard }) => guard),
          outer: [...resolved.outer],
          inner: [...resolved.inner],
        }
        const execute = matching(
          compiledPath,
          compileRoute(definition, options.compile),
          options.notFound,
        )
        compiled.push({ info, path: compiledPath, execute })
      }
    }
  }
  return compiled
}

/**
 * The url as it is declared, after the prefix, also its trailing slash: that
 * is what a client calls when its base url is the prefix.
 */
function routePath(
  prefix: string,
  url: string,
  where: string,
): { path: string; compiledPath: RoutePath } {
  const path = `${prefix}${url}` || '/'
  try {
    // A prefix must not hide that a url does not start with a slash.
    return { path, compiledPath: compileRoutePath(url === '' || url[0] === '/' ? path : url) }
  } catch (error) {
    throw new Error(`[Navios] ${where} cannot be served: ${(error as Error).message}.`, {
      cause: error,
    })
  }
}

/**
 * A router may match `/users/` to `/users/$id` with an empty `id`, and most
 * take `..` for a value. Neither is a request for the route.
 */
function matching(
  { params }: RoutePath,
  execute: RouteExecutor,
  notFound: RouteExecutor,
): RouteExecutor {
  if (params.length === 0) {
    return execute
  }
  return (input) => {
    const { urlParams } = input
    for (const name of params) {
      if (isUnmatchable(urlParams[name])) {
        return notFound(input)
      }
    }
    return execute(input)
  }
}

interface HandlerDraft {
  name: string
  config: RouteEndpointConfig
  invoke: RouteDefinition['invoke']
  guards: ClassType[]
  interceptors: ClassType[]
  attributes: Map<symbol, unknown>
}

function collectHandlers(
  controllerClass: ClassType,
  metadata: ControllerMetadata,
  controller: Record<string, unknown>,
): HandlerDraft[] {
  const drafts: HandlerDraft[] = []
  const seen = new Set<string>()

  // Field form: handler() values on the instance.
  for (const name of Object.keys(controller)) {
    const value = controller[name]
    if (!isFieldHandler(value)) {
      continue
    }
    seen.add(name)
    const extras = metadata.members.get(name)
    const attributes = new Map(extras?.attributes)
    for (const application of value.options.attributes ?? []) {
      attributes.set(application.token, application.value)
    }
    drafts.push({
      name,
      config: value.config as unknown as RouteEndpointConfig,
      invoke: value.invoke as RouteDefinition['invoke'],
      guards: [...(extras?.guards ?? []), ...(value.options.guards ?? [])],
      interceptors: [...(extras?.interceptors ?? []), ...(value.options.interceptors ?? [])],
      attributes,
    })
  }

  // Method form: @Endpoint on a method.
  for (const [name, member] of metadata.members) {
    if (seen.has(name)) {
      continue
    }
    const config = memberEndpoint(member)
    if (config === null) {
      // The member is another transport's handler; it has nothing to serve here.
      if (member.entries.size > 0) {
        continue
      }
      throw new Error(
        `[Navios] ${controllerClass.name}.${name} has guards, interceptors or attributes but ` +
          `is not a handler. Add @Endpoint(...) or define it with handler(...).`,
      )
    }
    const method = controller[name]
    if (typeof method !== 'function') {
      throw new Error(`[Navios] ${controllerClass.name}.${name} is not a method`)
    }
    drafts.push({
      name,
      config,
      invoke: method.bind(controller) as RouteDefinition['invoke'],
      guards: member.guards,
      interceptors: member.interceptors,
      attributes: member.attributes,
    })
  }
  return drafts
}
