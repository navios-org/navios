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
}

export const globalRegistry = new Registry()
