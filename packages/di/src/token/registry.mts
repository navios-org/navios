import { InjectableScope, InjectableType } from '../enums/index.mjs'

import type { StandardSchemaV1 } from './schema.mjs'
import type { ClassType, Token } from './token.mjs'

export type FactoryRecord<
  Instance = any,
  Schema extends StandardSchemaV1 | undefined = StandardSchemaV1 | undefined,
> = {
  scope: InjectableScope
  originalToken: Token<Instance, Schema>
  target: ClassType
  type: InjectableType
  priority: number
}

export class Registry {
  private readonly factories = new Map<string, FactoryRecord[]>()
  private readonly highestPriority = new Map<string, FactoryRecord>()

  constructor(private readonly parent?: Registry) {}

  has(token: Token<any, any>): boolean {
    if (this.factories.has(token.id)) {
      return true
    }
    if (this.parent) {
      return this.parent.has(token)
    }
    return false
  }

  get<Instance, Schema extends StandardSchemaV1 | undefined>(
    token: Token<Instance, Schema>,
  ): FactoryRecord<Instance, Schema> {
    const factory = this.highestPriority.get(token.id)
    if (!factory) {
      if (this.parent) {
        return this.parent.get(token)
      }
      throw new Error(`[Registry] No factory found for ${token.toString()}`)
    }
    // The factories map is keyed by token id and erases per-token generics;
    // the public signature re-narrows to the caller's token type.
    return factory as FactoryRecord<Instance, Schema>
  }

  getAll<Instance, Schema extends StandardSchemaV1 | undefined>(
    token: Token<Instance, Schema>,
  ): FactoryRecord<Instance, Schema>[] {
    const records = this.factories.get(token.id)
    if (!records || records.length === 0) {
      if (this.parent) {
        return this.parent.getAll(token)
      }
      return []
    }
    // Return sorted by priority (highest first). The factories map erases
    // per-token generics; the public signature re-narrows.
    return [...records].sort((a, b) => b.priority - a.priority) as FactoryRecord<
      Instance,
      Schema
    >[]
  }

  set<Instance, Schema extends StandardSchemaV1 | undefined>(
    token: Token<Instance, Schema>,
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

  delete(token: Token<any, any>) {
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

}

export const globalRegistry = /* #__PURE__ */ new Registry()
