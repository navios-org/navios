import type { InjectableScope } from '../injectable-scope.mjs'
import type { ClassType } from '../token/class-type.mjs'
import type { InjectionToken } from '../token/injection-token.mjs'

import type { FactoryContext } from './factory-context.mjs'

export type ProviderKind = 'class' | 'factory' | 'function' | 'value' | 'existing'

/**
 * How to produce the value for a token.
 */
export interface ProviderRecord {
  kind: ProviderKind
  /** `class`: the class to instantiate. `factory`: the `@Factory` class. */
  target: ClassType | undefined
  /** `function`: called with the factory context and the validated args. */
  fn: ((ctx: FactoryContext, args: any) => unknown) | undefined
  /** `value`: the value itself. `existing`: the class or token that is meant. */
  value: unknown
  scope: InjectableScope
  /**
   * The tokens a class asked for without args during its first successful
   * construction, in order; `null` until then. Args belong to one build, and
   * the plan is shared by every build of the provider, in every container.
   */
  plan: InjectionToken<any, any>[] | null
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
  kind: ProviderKind,
  scope: InjectableScope,
  target: ClassType | undefined,
  fn: ProviderRecord['fn'],
  value: unknown,
): ProviderRecord {
  return { kind, target, fn, value, scope, plan: null }
}
