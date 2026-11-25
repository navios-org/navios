import type { ClassType, InjectionToken, Provider } from '@navios/di'

import type { ModuleNode } from '../modules/module-graph.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface ModuleProvider {
  readonly module: ClassType
  readonly provider: Provider
  /**
   * Another module that provides something else for the token, when nothing
   * says which of the two is meant.
   */
  readonly rival?: ClassType
}

type Candidate = { node: ModuleNode; provider: Provider }

/** What a provider consists of. Its type does not show it. */
function parts(provider: Provider): unknown[] {
  const { record } = provider as unknown as { record: Record<string, unknown> }
  return [record.kind, record.scope, record.target, record.fn, record.value]
}

/** Whether two providers of one token come to the same. */
function isSame(left: Provider, right: Provider): boolean {
  const other = parts(right)
  return parts(left).every((part, index) => Object.is(part, other[index]))
}

function importsIndirectly(importer: ModuleNode, imported: ModuleNode): boolean {
  const seen = new Set<ModuleNode>()
  const pending = [imported]
  for (let node = pending.pop(); node !== undefined; node = pending.pop()) {
    if (node === importer) {
      return true
    }
    if (!seen.has(node)) {
      seen.add(node)
      pending.push(...node.importers)
    }
  }
  return false
}

function choose(candidates: readonly Candidate[]): ModuleProvider {
  const [first] = candidates
  const others = candidates.filter(({ provider }) => !isSame(provider, first.provider))
  if (others.length === 0) {
    return { module: first.node.module, provider: first.provider }
  }
  const [top, ...rest] = candidates.filter(
    ({ node }) =>
      !candidates.some((other) => other.node !== node && importsIndirectly(other.node, node)),
  )
  const rival = rest.find(({ provider }) => !isSame(provider, top.provider))
  return { module: top.node.module, provider: top.provider, rival: rival?.node.module }
}

/**
 * The provider that modules supply for each token. A module overrides what it
 * imports, directly or not, and of several in one list the last one counts.
 * Modules of the application override those that plugins add. Between modules
 * that do not import each other nothing says which one is meant, unless they
 * provide the same.
 */
export function moduleProviders(
  graph: readonly ModuleNode[],
  isOfApplication: (module: ClassType) => boolean,
): Map<InjectionToken<any, any>, ModuleProvider> {
  const candidates = new Map<InjectionToken<any, any>, Candidate[]>()
  // Importers first, so that a module that overrides another comes before it.
  for (const node of [...graph].reverse()) {
    const own = new Map(node.providers.map((provider) => [provider.token, provider]))
    for (const [token, provider] of own) {
      const list = candidates.get(token)
      if (list) {
        list.push({ node, provider })
      } else {
        candidates.set(token, [{ node, provider }])
      }
    }
  }
  const chosen = new Map<InjectionToken<any, any>, ModuleProvider>()
  for (const [token, all] of candidates) {
    const ofApplication = all.filter(({ node }) => isOfApplication(node.module))
    chosen.set(token, choose(ofApplication.length > 0 ? ofApplication : all))
  }
  return chosen
}
