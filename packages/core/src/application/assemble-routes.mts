import type { ClassType, Container } from '@navios/di'

import { getControllerMetadata } from '../controllers/controller-metadata.mjs'
import { isFieldHandler } from '../handlers/handler.mjs'
import { compileRoute } from '../pipeline/compile-route.mjs'
import { joinPaths } from '../routing/join-paths.mjs'

import type { ControllerMetadata } from '../controllers/controller-metadata.mjs'
import type { ModuleNode } from '../modules/module-graph.mjs'
import type { CompileOptions, RouteDefinition } from '../pipeline/compile-route.mjs'
import type { CompiledRoute } from '../routing/compiled-route.mjs'
import type { RouteEndpointConfig } from '../routing/endpoint-config.mjs'
import type { HttpGuard as Guard } from '../routing/http-contracts.mjs'
import type { HttpInterceptor as Interceptor } from '../routing/http-contracts.mjs'
import type { RouteInfo } from '../routing/route-info.mjs'

import { moduleControllers } from './http-module-options.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * What route assembly needs of the application.
 * @internal
 */
export interface RouteAssemblyOptions {
  container: Container
  /** Each module's route prefix, from `computeModulePrefixes`. */
  prefixes: ReadonlyMap<ClassType, string>
  /** Interceptors around every route, outermost first. */
  globalInterceptors: ClassType[]
  /** Passed to the compiler of every route. */
  compile: CompileOptions
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
  const { container, globalInterceptors } = options
  const compiled: CompiledRoute[] = []
  const taken = new Map<string, string>()

  for (const node of graph) {
    const prefix = options.prefixes.get(node.module) ?? ''
    for (const controllerClass of moduleControllers(node)) {
      const metadata = getControllerMetadata(controllerClass)
      const controller = (await container.get(controllerClass)) as Record<string, unknown>

      for (const draft of collectHandlers(controllerClass, metadata, controller)) {
        const guards = unique([...node.guards, ...metadata.guards, ...draft.guards])
        const interceptors = unique([
          ...globalInterceptors,
          ...node.interceptors,
          ...metadata.interceptors,
          ...draft.interceptors,
        ])
        const path = joinPaths(prefix, draft.config.url) || '/'
        const where = `${controllerClass.name}.${draft.name}`
        const key = `${draft.config.method} ${path.replace(/\$[^/]+/g, '$')}`
        const existing = taken.get(key)
        if (existing) {
          throw new Error(
            `[Navios] ${draft.config.method} ${path} is served by both ${existing} and ${where}.`,
          )
        }
        taken.set(key, where)

        const info: RouteInfo = {
          method: draft.config.method,
          path,
          endpoint: draft.config,
          module: node.module,
          controller: controllerClass,
          handlerName: draft.name,
          guards,
          interceptors,
          attributes: {
            handler: draft.attributes,
            controller: metadata.attributes,
            module: node.attributes,
          },
        }
        const definition: RouteDefinition = {
          info,
          invoke: draft.invoke,
          guards: await instances<Guard>(container, guards, 'Guard', 'canActivate'),
          interceptors: await instances<Interceptor>(
            container,
            interceptors,
            'Interceptor',
            'intercept',
          ),
        }
        const execute = compileRoute(definition, options.compile)
        compiled.push({ info, execute })
      }
    }
  }
  return compiled
}

async function instances<T>(
  container: Container,
  classes: ClassType[],
  kind: string,
  method: string,
): Promise<T[]> {
  const result: T[] = []
  for (const cls of classes) {
    const instance = (await container.get(cls)) as any
    if (typeof instance?.[method] !== 'function') {
      throw new Error(`[Navios] ${kind} ${cls.name} does not implement ${method}()`)
    }
    result.push(instance)
  }
  return result
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
    if (member.config === null) {
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
      config: member.config,
      invoke: method.bind(controller) as RouteDefinition['invoke'],
      guards: member.guards,
      interceptors: member.interceptors,
      attributes: member.attributes,
    })
  }
  return drafts
}

function unique<T>(list: T[]): T[] {
  return Array.from(new Set(list))
}
