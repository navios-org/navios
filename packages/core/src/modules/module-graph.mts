import type { ClassType, Provider } from '@navios/di'

import { getModuleMetadata } from './module-metadata.mjs'

/**
 * A module as it applies to one application: its guards, interceptors and
 * attributes together with those it inherits, and the modules that import it.
 */
export interface ModuleNode {
  module: ClassType
  providers: Provider[]
  /** The module's transport-specific options, by option name. */
  entries: ReadonlyMap<string, unknown>
  guards: ClassType[]
  interceptors: ClassType[]
  attributes: Map<symbol, unknown>
  /** The modules that import this one, in the order they were reached. */
  importers: ModuleNode[]
  /** Whether the module was given to the application directly. */
  isRoot: boolean
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
 * - For attributes, the nearest module that sets a value wins.
 *
 * Modules are returned in dependency order: a module comes after everything
 * it imports.
 */
export function buildModuleGraph(roots: ClassType[]): ModuleNode[] {
  const nodes = new Map<ClassType, ModuleNode>()
  const order: ClassType[] = []
  const stack: ClassType[] = []

  const visit = (
    module: ClassType,
    importer: ModuleNode | null,
    inheritedGuards: ClassType[],
    inheritedInterceptors: ClassType[],
    inheritedAttributes: Map<symbol, unknown>,
  ): void => {
    let node = nodes.get(module)
    if (node && importer && !node.importers.includes(importer)) {
      node.importers.push(importer)
    }
    if (stack.includes(module)) {
      return
    }
    const metadata = getModuleMetadata(module)
    if (!node) {
      node = {
        module,
        providers: metadata.providers,
        entries: metadata.entries,
        guards: [],
        interceptors: [],
        attributes: new Map(),
        importers: importer ? [importer] : [],
        isRoot: false,
      }
      nodes.set(module, node)
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
      visit(imported, node, node.guards, node.interceptors, attributes)
    }
    stack.pop()
    if (!order.includes(module)) {
      order.push(module)
    }
  }

  for (const root of roots) {
    visit(root, null, [], [], new Map())
    nodes.get(root)!.isRoot = true
  }
  return order.map((module) => nodes.get(module)!)
}
