import type { ClassType } from '@navios/core'
import type { ModuleNode } from '@navios/core/transport'

import { joinPaths } from '../routing/join-paths.mjs'

import { moduleControllers, modulePrefix } from './http-module-options.mjs'

/**
 * Each module's route prefix: its importers' prefixes followed by its own,
 * and the global prefix in front of a root's.
 *
 * A module with controllers that is reached under two different prefixes is
 * an error, because its routes would be ambiguous. A module without
 * controllers takes the first.
 */
export function computeModulePrefixes(
  graph: readonly ModuleNode[],
  globalPrefix: string,
): Map<ClassType, string> {
  // The graph lists a module before its importers, so walking it backwards
  // meets every importer first. An importer that has not been met yet closes
  // an import cycle and contributes nothing.
  const prefixes = new Map<ModuleNode, string[]>()
  for (let i = graph.length - 1; i >= 0; i--) {
    const node = graph[i]
    const own = modulePrefix(node)
    const found: string[] = []
    const add = (prefix: string) => {
      if (!found.includes(prefix)) {
        found.push(prefix)
      }
    }
    if (node.isRoot) {
      add(joinPaths(globalPrefix, own))
    }
    for (const importer of node.importers) {
      for (const prefix of prefixes.get(importer) ?? []) {
        add(joinPaths(prefix, own))
      }
    }
    prefixes.set(node, found)
  }

  const result = new Map<ClassType, string>()
  for (const node of graph) {
    const [first, other] = prefixes.get(node)!
    if (other !== undefined && moduleControllers(node).length > 0) {
      throw new Error(
        `[Navios] Module ${node.module.name} is imported under two different prefixes ` +
          `("${first || '/'}" and "${other || '/'}"). A module with controllers can be mounted once.`,
      )
    }
    result.set(node.module, first ?? joinPaths(globalPrefix, modulePrefix(node)))
  }
  return result
}
