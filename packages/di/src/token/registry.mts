import type { ClassType, InjectionToken } from './injection-token.mjs'

import { InjectableScope, InjectableType } from '../enums/index.mjs'

export type FactoryRecord<Instance = any, Schema = any> = {
  scope: InjectableScope
  originalToken: InjectionToken<Instance, Schema>
  target: ClassType
  type: InjectableType
  priority: number
}

export class Registry {
  private readonly factories = new Map<string, FactoryRecord[]>()
  private readonly highestPriority = new Map<string, FactoryRecord>()

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
    const factory = this.highestPriority.get(token.id)
    if (!factory) {
      if (this.parent) {
        return this.parent.get(token)
      }
      throw new Error(`[Registry] No factory found for ${token.toString()}`)
    }
    return factory
  }

  getAll<Instance, Schema>(
    token: InjectionToken<Instance, Schema>,
  ): FactoryRecord<Instance, Schema>[] {
    const records = this.factories.get(token.id)
    if (!records || records.length === 0) {
      if (this.parent) {
        return this.parent.getAll(token)
      }
      return []
    }
    // Return sorted by priority (highest first)
    return [...records].sort((a, b) => b.priority - a.priority)
  }

  set<Instance, Schema>(
    token: InjectionToken<Instance, Schema>,
    scope: InjectableScope,
    target: ClassType,
    type: InjectableType,
    priority: number = 0,
  ) {
    const record: FactoryRecord<Instance, Schema> = {
      scope,
      originalToken: token,
      target,
      type,
      priority,
    }

    // Add to factories array
    const existing = this.factories.get(token.id) || []
    existing.push(record)
    this.factories.set(token.id, existing)

    // Update highest priority cache if needed
    const currentHighest = this.highestPriority.get(token.id)
    if (!currentHighest || priority > currentHighest.priority) {
      this.highestPriority.set(token.id, record)
    }
  }

  delete(token: InjectionToken<any, any>) {
    const records = this.factories.get(token.id)
    if (records) {
      const deletedHighest = this.highestPriority.get(token.id)
      this.factories.delete(token.id)
      this.highestPriority.delete(token.id)

      // If we deleted the highest priority record, recalculate from remaining records
      if (deletedHighest && records.length > 1) {
        const remaining = records.filter(
          (r) =>
            r.originalToken.id !== deletedHighest.originalToken.id ||
            r.priority !== deletedHighest.priority,
        )
        if (remaining.length > 0) {
          const newHighest = remaining.reduce((max, current) =>
            current.priority > max.priority ? current : max,
          )
          this.highestPriority.set(token.id, newHighest)
          this.factories.set(token.id, remaining)
        }
      }
    }
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
  updateScope(
    token: InjectionToken<any, any>,
    scope: InjectableScope,
  ): boolean {
    const records = this.factories.get(token.id)
    if (records && records.length > 0) {
      // Update all records
      records.forEach((record) => {
        record.scope = scope
      })
      // Update highest priority cache if it exists
      const highest = this.highestPriority.get(token.id)
      if (highest) {
        highest.scope = scope
      }
      return true
    }
    if (this.parent) {
      return this.parent.updateScope(token, scope)
    }
    return false
  }
}

export const globalRegistry = /* #__PURE__ */ new Registry()
