import type { InjectableScope } from '../injectable-scope.mjs'
import type { ClassType } from '../token/class-type.mjs'
import type { InjectionToken } from '../token/injection-token.mjs'

import type { FactoryContext } from './factory-context.mjs'

export type ProviderKind = 'class' | 'factory' | 'function' | 'value' | 'existing'

/**
 * One request made by a class while it was being constructed. Only requests
 * without args are recorded: args belong to one build, and the plan is shared
 * by every build of the provider, in every container.
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
  /** `value`: the value itself. `existing`: the class or token that is meant. */
  value: unknown
  scope: InjectableScope
  /**
   * Requests without args made during the first successful construction, in
   * order. `null` until then.
   */
  plan: PlanEntry[] | null
  /** Set when what it produces stands in for something, like an auto-mock. */
  isMock?: boolean
}

/** What can be known about a provider from the outside. */
export interface ProviderInfo {
  /**
   * `class`: instances of `target`. `factory`: products of the `@Factory` class
   * `target`. `function`: products of a factory function. `value`: a ready
   * value. `existing`: an alias of another class or token.
   */
  readonly kind: ProviderKind
  readonly scope: InjectableScope
  readonly target: ClassType | undefined
}

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
