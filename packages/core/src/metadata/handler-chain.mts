import type { ClassType } from '@navios/di'

interface Extras {
  readonly guards: readonly ClassType[]
  readonly interceptors: readonly ClassType[]
}

export interface HandlerChainInput {
  /** Interceptors around every handler of the application, outermost first. */
  application: readonly ClassType[]
  /** The module the handler belongs to, with what it inherits. */
  node: Extras
  /** The class that owns the handler. */
  owner: Extras
  /** The handler itself. */
  member: Extras
}

/**
 * The guards and interceptors that apply to one handler, in the order they
 * run: guards from the module chain, the owning class, then the handler;
 * interceptors from the application first, then the same three. A class that
 * appears twice is kept where it first appears.
 *
 * Every transport uses this, so the rule is the same everywhere. Running the
 * chain is the transport's business.
 */
export function handlerChain(input: HandlerChainInput): {
  guards: ClassType[]
  interceptors: ClassType[]
} {
  const { application, node, owner, member } = input
  return {
    guards: Array.from(new Set([...node.guards, ...owner.guards, ...member.guards])),
    interceptors: Array.from(
      new Set([
        ...application,
        ...node.interceptors,
        ...owner.interceptors,
        ...member.interceptors,
      ]),
    ),
  }
}
