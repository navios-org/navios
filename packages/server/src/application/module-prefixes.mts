import type { ModuleNode } from '@navios/core/transport'
import type { ClassType } from '@navios/di'

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
  const prefixesOf = (node: ModuleNode, path: ModuleNode[]): string[] => {
    const own = modulePrefix(node)
    const prefixes: string[] = []
    const add = (prefix: string) => {
      if (!prefixes.includes(prefix)) {
        prefixes.push(prefix)
      }
    }
    if (node.isRoot) {
      add(joinPaths(globalPrefix, own))
    }
    path.push(node)
    for (const importer of node.importers) {
      // An importer already on the path is an import cycle.
      if (!path.includes(importer)) {
        for (const prefix of prefixesOf(importer, path)) {
          add(joinPaths(prefix, own))
        }
      }
    }
    path.pop()
    return prefixes
  }

  const result = new Map<ClassType, string>()
  for (const node of graph) {
    const [first, other] = prefixesOf(node, [])
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
