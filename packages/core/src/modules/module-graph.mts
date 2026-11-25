import type { ClassType, Provider } from '@navios/di'

import { joinPaths } from '../routing/join-paths.mjs'

import type { RequestValueClass } from '../context/request-value.mjs'

import { getModuleMetadata } from './module-metadata.mjs'

/**
 * A module as it applies to one application: its prefix with every importer's
 * prefix in front, and its guards, interceptors and attributes together with
 * those it inherits.
 */
export interface ModuleNode {
  module: ClassType
  prefix: string
  controllers: ClassType[]
  guards: ClassType[]
  interceptors: ClassType[]
  attributes: Map<symbol, unknown>
  providers: Provider[]
  requestValues: RequestValueClass[]
}

function addAll<T>(target: T[], source: Iterable<T>): void {
  for (const item of source) {
    if (!target.includes(item)) {
      target.push(item)
    }
  }
}

/**
 * Walks the import graph from the given roots and computes, for this
 * application only, what applies to each module.
 *
 * - Guards and interceptors are the union over every path that reaches a
 *   module, outermost first. Nothing is written back to the classes, so two
 *   applications importing one module under different parents do not affect
 *   each other.
 * - A module's prefix is its importers' prefixes followed by its own. A
 *   module with controllers that is reached under two different prefixes is
 *   an error, because its routes would be ambiguous.
 * - For attributes, the nearest module that sets a value wins.
 *
 * Modules are returned in dependency order: a module comes after everything
 * it imports.
 */
export function buildModuleGraph(roots: ClassType[], globalPrefix: string): ModuleNode[] {
  const nodes = new Map<ClassType, ModuleNode>()
  const order: ClassType[] = []
  const stack: ClassType[] = []

  const visit = (
    module: ClassType,
    parentPrefix: string,
    inheritedGuards: ClassType[],
    inheritedInterceptors: ClassType[],
    inheritedAttributes: Map<symbol, unknown>,
  ): void => {
    if (stack.includes(module)) {
      return
    }
    const metadata = getModuleMetadata(module)
    const prefix = joinPaths(parentPrefix, metadata.prefix)
    let node = nodes.get(module)
    if (!node) {
      node = {
        module,
        prefix,
        controllers: metadata.controllers,
        guards: [],
        interceptors: [],
        attributes: new Map(),
        providers: metadata.providers,
        requestValues: metadata.requestValues,
      }
      nodes.set(module, node)
    } else if (node.prefix !== prefix && metadata.controllers.length > 0) {
      throw new Error(
        `[Navios] Module ${module.name} is imported under two different prefixes ` +
          `("${node.prefix || '/'}" and "${prefix || '/'}"). A module with controllers can be mounted once.`,
      )
    }

    addAll(node.guards, inheritedGuards)
    addAll(node.guards, metadata.guards)
    addAll(node.interceptors, inheritedInterceptors)
    addAll(node.interceptors, metadata.interceptors)

    const attributes = new Map(inheritedAttributes)
    for (const [key, value] of metadata.attributes) {
      attributes.set(key, value)
    }
    for (const [key, value] of attributes) {
      if (!node.attributes.has(key) || metadata.attributes.has(key)) {
        node.attributes.set(key, value)
      }
    }

    stack.push(module)
    for (const imported of metadata.imports) {
      visit(imported, prefix, node.guards, node.interceptors, attributes)
    }
    stack.pop()

    if (!order.includes(module)) {
      order.push(module)
    }
  }

  for (const root of roots) {
    visit(root, globalPrefix, [], [], new Map())
  }
  return order.map((module) => nodes.get(module)!)
}
