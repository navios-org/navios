import { isDeepStrictEqual } from 'node:util'

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
  /**
   * The attributes that the importers of the module do not agree about, and what
   * each of two import paths gives it. They are not among `attributes`;
   * `handlerChain` refuses a handler that would inherit one.
   */
  disputed: ReadonlyMap<symbol, string>
  /** The modules that import this one, in the order they were reached. */
  importers: ModuleNode[]
  /** Whether the module was given to the application directly. */
  isRoot: boolean
}

/**
 * The classes a module lists under one of the options of a transport, once
 * each. Throws for an entry that is not a class: what an import cycle between
 * the files of two classes leaves behind.
 */
export function moduleClasses(
  node: Pick<ModuleNode, 'module' | 'entries'>,
  entry: string,
): ClassType[] {
  const listed = node.entries.get(entry) as Iterable<unknown> | null | undefined
  if (!listed) {
    return []
  }
  const classes = Array.from(new Set(listed))
  const index = classes.findIndex((listedClass) => typeof listedClass !== 'function')
  if (index !== -1) {
    throw new Error(
      `[Navios] Module ${node.module.name} lists ${String(classes[index])} in ${entry}. When it ` +
        `should be a class, the files of the two usually import each other.`,
    )
  }
  return classes as ClassType[]
}

/** Two import paths that give a module different values of one attribute. */
interface Disagreement {
  one: ClassType[]
  other: ClassType[]
  /** Whether the other path gives a value at all. */
  otherHasValue: boolean
}

/** What a module has while the graph is being computed. */
interface Draft {
  node: ModuleNode
  metadata: ModuleMetadata
  /** The attributes the importers do not agree about. */
  disagreements: Map<symbol, Disagreement>
  /** Whether the walk is at what it imports. */
  open: boolean
  ranked: boolean
}

function addAll<T>(target: T[], source: Iterable<T>): void {
  for (const item of source) {
    if (!target.includes(item)) {
      target.push(item)
    }
  }
}

function names(path: readonly ClassType[]): string {
  return path.map((module) => module.name).join(' -> ')
}

/** One way to a module from a root, the module included. */
function pathTo(node: ModuleNode): ClassType[] {
  const path = [node.module]
  for (let at = node; !at.isRoot && at.importers.length > 0;) {
    at = at.importers[0]
    path.unshift(at.module)
  }
  return path
}

/**
 * Gives a module the attributes it inherits. Guards add up over several import
 * paths, which is safe; attributes cannot. One that opens a handler and one that
 * restricts it would each be wrong if it applied because of one path alone, so
 * the paths have to agree where a handler inherits it.
 */
function inheritAttributes(draft: Draft, importers: readonly Draft[]): void {
  const { node, metadata, disagreements } = draft
  const keys = new Set(
    importers.flatMap((importer) => [
      ...importer.node.attributes.keys(),
      ...importer.disagreements.keys(),
    ]),
  )
  for (const key of keys) {
    if (metadata.attributes.has(key)) {
      continue
    }
    const inherited = importers.find((importer) => importer.disagreements.has(key))
    if (inherited) {
      const { one, other, otherHasValue } = inherited.disagreements.get(key)!
      disagreements.set(key, {
        one: [...one, node.module],
        other: [...other, node.module],
        otherHasValue,
      })
      continue
    }
    const source = importers.find((importer) => importer.node.attributes.has(key))!
    const value = source.node.attributes.get(key)
    const disagrees = (importer: Draft) =>
      !importer.node.attributes.has(key) ||
      !isDeepStrictEqual(importer.node.attributes.get(key), value)
    const other = importers.find(disagrees)
    if (other === undefined && !node.isRoot) {
      node.attributes.set(key, value)
    } else {
      disagreements.set(key, {
        one: [...pathTo(source.node), node.module],
        other: other === undefined ? [node.module] : [...pathTo(other.node), node.module],
        otherHasValue: other !== undefined && other.node.attributes.has(key),
      })
    }
  }
  node.disputed = new Map(Array.from(disagreements, ([key, value]) => [key, described(value)]))
}

function described({ one, other, otherHasValue }: Disagreement): string {
  return `one over ${names(one)}, ${otherHasValue ? 'another' : 'none'} over ${names(other)}`
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
 * - An attribute comes from the module itself or else from what imports it.
 *   One that the importers do not agree about is in `disputed` instead.
 *
 * Neither depends on the order in which a module happens to be reached.
 * Modules are returned in dependency order: a module comes after everything
 * it imports. That cannot be done for modules that import each other, which is
 * an error as well.
 */
export function buildModuleGraph(roots: ClassType[]): ModuleNode[] {
  const drafts = new Map<ClassType, Draft>()
  const order: ModuleNode[] = []

  // First walk: every module once, in dependency order, with its importers.
  const path: ClassType[] = []
  const visit = (module: ClassType, importer: ModuleNode | null): void => {
    const known = drafts.get(module)
    if (known) {
      if (known.open) {
        throw new Error(
          `[Navios] Modules import each other in a cycle: ` +
            names([...path.slice(path.indexOf(module)), module]),
        )
      }
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
      disputed: new Map(),
      importers: importer ? [importer] : [],
      isRoot: false,
    }
    const draft: Draft = {
      node,
      metadata,
      disagreements: new Map(),
      open: true,
      ranked: false,
    }
    drafts.set(module, draft)
    path.push(module)
    for (const imported of imports) {
      visit(imported, node)
    }
    path.pop()
    draft.open = false
    order.push(node)
  }
  for (const root of roots) {
    visit(root, null)
    drafts.get(root)!.node.isRoot = true
  }

  // Second walk: importers before what they import, siblings in import
  // order. That is the reverse of a post-order that takes the imports last
  // to first.
  const outermostFirst: Draft[] = []
  const rank = (draft: Draft): void => {
    if (draft.ranked) {
      return
    }
    draft.ranked = true
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

  // Each module is complete when its turn comes, because everything that
  // imports it came before; it then hands what it has to its imports.
  for (const draft of outermostFirst) {
    const { node, metadata } = draft
    addAll(node.guards, metadata.guards)
    addAll(node.interceptors, metadata.interceptors)
    inheritAttributes(
      draft,
      node.importers.map((importer) => drafts.get(importer.module)!),
    )
    for (const [key, value] of metadata.attributes) {
      node.attributes.set(key, value)
    }
    for (const imported of metadata.imports) {
      const child = drafts.get(imported)!
      addAll(child.node.guards, node.guards)
      addAll(child.node.interceptors, node.interceptors)
    }
  }
  return order
}
