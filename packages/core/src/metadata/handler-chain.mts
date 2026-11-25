import type { ClassType } from '@navios/di'

import type { ModuleNode } from '../modules/module-graph.mjs'

interface Extras {
  readonly guards: readonly ClassType[]
  readonly interceptors: readonly ClassType[]
}

interface OwnExtras extends Extras {
  readonly attributes: ReadonlyMap<symbol, unknown>
}

export interface HandlerChainInput {
  /**
   * Interceptors around every handler of the application or of the transport,
   * outermost first.
   */
  application: readonly ClassType[]
  /** The module the handler belongs to, with what it inherits. */
  node: Extras & Pick<ModuleNode, 'module' | 'disputed'>
  /** The class that owns the handler. */
  owner: OwnExtras
  /** The handler itself. */
  member: OwnExtras
}

export interface HandlerChain {
  guards: ClassType[]
  /** `outer` and `inner`, one after the other. */
  interceptors: ClassType[]
  /** Interceptors around the guards: those of the application. */
  outer: ClassType[]
  /** Interceptors inside the guards: those of the module, the class and the handler. */
  inner: ClassType[]
}

/**
 * An attribute may open the handler to everyone or restrict it, so it is not
 * guessed which of the import paths is meant.
 */
function assertUndisputed({ node, owner, member }: HandlerChainInput): void {
  for (const [key, paths] of node.disputed) {
    if (!owner.attributes.has(key) && !member.attributes.has(key)) {
      throw new Error(
        `[Navios] Module ${node.module.name} inherits different values of the attribute ` +
          `${String(key)}: ${paths}. Set it on the controllers or handlers it is meant for, or ` +
          `on ${node.module.name} itself.`,
      )
    }
  }
}

/**
 * The guards and interceptors that apply to one handler, in the order they
 * run: the interceptors of the application, then the guards from the module
 * chain, the owning class and the handler, then the interceptors of the same
 * three. A class that appears twice is kept where it first appears.
 *
 * An interceptor of the application sees every execution, denied ones
 * included, as tracing and logging need. One that is attached to handlers runs
 * only for what their guards let through.
 *
 * Throws when the handler would inherit an attribute that the importers of its
 * module do not agree about.
 *
 * Every transport uses this, so the rule is the same everywhere. `runChain`
 * runs the chain.
 */
export function handlerChain(input: HandlerChainInput): HandlerChain {
  assertUndisputed(input)
  const { application, node, owner, member } = input
  const outer = new Set(application)
  const attached = [...node.interceptors, ...owner.interceptors, ...member.interceptors]
  const inner = new Set(attached.filter((interceptor) => !outer.has(interceptor)))
  return {
    guards: Array.from(new Set([...node.guards, ...owner.guards, ...member.guards])),
    interceptors: [...outer, ...inner],
    outer: Array.from(outer),
    inner: Array.from(inner),
  }
}
