import type { ClassType, Provider } from '@navios/di'

import { assertImportsDefined, getModuleMetadata } from './module-metadata.mjs'

import type { ModuleMetadata } from './module-metadata.mjs'

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

/** What a module has while the graph is being computed. */
interface Draft {
  node: ModuleNode
  metadata: ModuleMetadata
  /** How many edges away each attribute was set; 0 is the module itself. */
  distances: Map<symbol, number>
  /** Position in the outermost-first order, once known. */
  rank: number
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
 *   module, outermost first: what the importers contribute, importers in
 *   import order, then the module's own. Nothing is written back to the
 *   classes, so two applications importing one module under different parents
 *   do not affect each other.
 * - For attributes, the nearest module that sets a value wins: the one the
 *   fewest imports away, and of two equally near, the outermost.
 *
 * Neither depends on the order in which a module happens to be reached.
 * Modules are returned in dependency order: a module comes after everything
 * it imports.
 */
export function buildModuleGraph(roots: ClassType[]): ModuleNode[] {
  const drafts = new Map<ClassType, Draft>()
  const order: ModuleNode[] = []

  // First walk: every module once, in dependency order, with its importers.
  const visit = (module: ClassType, importer: ModuleNode | null): void => {
    const known = drafts.get(module)
    if (known) {
      if (importer && !known.node.importers.includes(importer)) {
        known.node.importers.push(importer)
      }
      return
    }
    const metadata = getModuleMetadata(module)
    const imports = metadata.imports
    assertImportsDefined(module, imports)
    const node: ModuleNode = {
      module,
      providers: metadata.providers,
      entries: metadata.entries,
      guards: [],
      interceptors: [],
      attributes: new Map(),
      importers: importer ? [importer] : [],
      isRoot: false,
    }
    drafts.set(module, { node, metadata, distances: new Map(), rank: -1 })
    for (const imported of imports) {
      visit(imported, node)
    }
    order.push(node)
  }
  for (const root of roots) {
    visit(root, null)
    drafts.get(root)!.node.isRoot = true
  }

  // Second walk: importers before what they import, siblings in import
  // order. That is the reverse of a post-order that takes the imports last
  // to first. An import that closes a cycle points back up this order.
  const outermostFirst: Draft[] = []
  const rank = (draft: Draft): void => {
    if (draft.rank !== -1) {
      return
    }
    draft.rank = 0
    const imports = draft.metadata.imports
    for (let i = imports.length - 1; i >= 0; i--) {
      rank(drafts.get(imports[i])!)
    }
    outermostFirst.push(draft)
  }
  for (let i = roots.length - 1; i >= 0; i--) {
    rank(drafts.get(roots[i])!)
  }
  outermostFirst.reverse()
  outermostFirst.forEach((draft, index) => {
    draft.rank = index
  })

  // Each module is complete when its turn comes, because everything that
  // imports it came before; it then hands what it has to its imports.
  for (const draft of outermostFirst) {
    const { node, metadata, distances } = draft
    addAll(node.guards, metadata.guards)
    addAll(node.interceptors, metadata.interceptors)
    for (const [key, value] of metadata.attributes) {
      node.attributes.set(key, value)
      distances.set(key, 0)
    }
    for (const imported of metadata.imports) {
      const child = drafts.get(imported)!
      if (child.rank <= draft.rank) {
        // Closes a cycle: nothing is inherited against the direction of it.
        continue
      }
      addAll(child.node.guards, node.guards)
      addAll(child.node.interceptors, node.interceptors)
      for (const [key, value] of node.attributes) {
        const distance = distances.get(key)! + 1
        const current = child.distances.get(key)
        if (current === undefined || distance < current) {
          child.node.attributes.set(key, value)
          child.distances.set(key, distance)
        }
      }
    }
  }
  return order
}
