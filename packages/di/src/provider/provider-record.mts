import type { InjectableScope } from '../injectable-scope.mjs'
import type { ClassType } from '../token/class-type.mjs'
import type { InjectionToken } from '../token/injection-token.mjs'

import type { FactoryContext } from './factory-context.mjs'

export type ProviderKind = 'class' | 'factory' | 'function' | 'value'

/**
 * One request made by a class while it was being constructed. Only requests
 * without args are recorded: args belong to one build, and the plan is shared
 * by every build of the provider, in every container.
 * @internal
 */
export interface PlanEntry {
  token: InjectionToken<any, any>
}

/**
 * How to produce the value for a token.
 */
export interface ProviderRecord {
  token: InjectionToken<any, any>
  kind: ProviderKind
  /** `class`: the class to instantiate. `factory`: the `@Factory` class. */
  target: ClassType | undefined
  /** `function`: called with the factory context and the validated args. */
  fn: ((ctx: FactoryContext, args: any) => unknown) | undefined
  /** `value`: the value itself. */
  value: unknown
  scope: InjectableScope
  /**
   * Requests without args made during the first successful construction, in
   * order. `null` until then.
   * @internal
   */
  plan: PlanEntry[] | null
  /**
   * Set once a construction pass of this provider had to be discarded because
   * a dependency was not ready; later builds resolve the plan up front.
   * @internal
   */
  preResolve?: boolean
}

/** @internal */
export function createRecord(
  token: InjectionToken<any, any>,
  kind: ProviderKind,
  scope: InjectableScope,
  target: ClassType | undefined,
  fn: ProviderRecord['fn'],
  value: unknown,
): ProviderRecord {
  return { token, kind, target, fn, value, scope, plan: null }
}
