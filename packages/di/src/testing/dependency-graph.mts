import type { Entry } from '../internal/entry.mjs'

/**
 * A node in the dependency graph.
 */
export interface DependencyNode {
  /** The token's name (`token.toString()`). */
  token: string
  /** The token's name, followed by `:<args key>` for an instance with args. */
  instanceName: string
  scope: string
  dependencies: string[]
  dependents: string[]
}

/**
 * Serializable dependency graph for snapshot testing.
 */
export interface DependencyGraph {
  nodes: Record<string, DependencyNode>
  rootTokens: string[]
}

/**
 * Builds the dependency graph of `entries`. Links to entries outside the list
 * are left out.
 */
export function buildDependencyGraph(entries: Entry[]): DependencyGraph {
  const included = new Set(entries)
  const namesOf = (linked: Iterable<Entry> | null): string[] => {
    const names = new Set<string>()
    if (linked !== null) {
      for (const entry of linked) {
        if (included.has(entry)) {
          names.add(nodeName(entry))
        }
      }
    }
    return Array.from(names)
  }

  const nodes: Record<string, DependencyNode> = {}
  const rootTokens: string[] = []

  for (const entry of entries) {
    const name = nodeName(entry)
    const dependents = namesOf(entry.dependents)
    nodes[name] = {
      token: entry.token.toString(),
      instanceName: name,
      scope: entry.record.scope,
      dependencies: namesOf(entry.deps),
      dependents,
    }

    // Root tokens have no dependents
    if (dependents.length === 0) {
      rootTokens.push(name)
    }
  }

  return { nodes, rootTokens }
}

/**
 * Builds a graph of token names only: each token with the tokens it depends
 * on, sorted.
 */
export function buildSimplifiedDependencyGraph(entries: Entry[]): Record<string, string[]> {
  const included = new Set(entries)
  const graph: Record<string, string[]> = {}

  for (const entry of entries) {
    const dependencies = (graph[entry.token.toString()] ??= [])
    if (entry.deps === null) {
      continue
    }
    for (const dependency of entry.deps) {
      const name = dependency.token.toString()
      if (included.has(dependency) && !dependencies.includes(name)) {
        dependencies.push(name)
      }
    }
  }

  // Sort for consistent snapshots
  for (const key of Object.keys(graph)) {
    graph[key].sort()
  }

  return graph
}

function nodeName(entry: Entry): string {
  const name = entry.token.toString()
  return entry.key === null ? name : `${name}:${entry.key}`
}
