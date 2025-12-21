import type { ClassType, InjectionToken } from './injection-token.mjs'

import { InjectableScope, InjectableType } from '../enums/index.mjs'

export type FactoryRecord<Instance = any, Schema = any> = {
  scope: InjectableScope
  originalToken: InjectionToken<Instance, Schema>
  target: ClassType
  type: InjectableType
}

export class Registry {
  private readonly factories = new Map<string, FactoryRecord>()

  constructor(private readonly parent?: Registry) {}

  has(token: InjectionToken<any, any>): boolean {
    if (this.factories.has(token.id)) {
      return true
    }
    if (this.parent) {
      return this.parent.has(token)
    }
    return false
  }

  get<Instance, Schema>(
    token: InjectionToken<Instance, Schema>,
  ): FactoryRecord<Instance, Schema> {
    const factory = this.factories.get(token.id)
    if (!factory) {
      if (this.parent) {
        return this.parent.get(token)
      }
      throw new Error(`[Registry] No factory found for ${token.toString()}`)
    }
    return factory
  }

  set<Instance, Schema>(
    token: InjectionToken<Instance, Schema>,
    scope: InjectableScope,
    target: ClassType,
    type: InjectableType,
  ) {
    this.factories.set(token.id, { scope, originalToken: token, target, type })
  }

  delete(token: InjectionToken<any, any>) {
    this.factories.delete(token.id)
  }

  /**
   * Updates the scope of an already registered factory.
   * This is useful when you need to dynamically change a service's scope
   * (e.g., when a singleton controller has request-scoped dependencies).
   *
   * @param token The injection token to update
   * @param scope The new scope to set
   * @returns true if the scope was updated, false if the token was not found
   */
  updateScope(token: InjectionToken<any, any>, scope: InjectableScope): boolean {
    const factory = this.factories.get(token.id)
    if (factory) {
      factory.scope = scope
      return true
    }
    if (this.parent) {
      return this.parent.updateScope(token, scope)
    }
    return false
  }
}

export const globalRegistry = new Registry()
