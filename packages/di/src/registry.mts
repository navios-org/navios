import type { z, ZodObject } from 'zod/v4'

import type { FactoryContext } from './factory-context.mjs'
import type { InjectionToken } from './injection-token.mjs'

import { InjectableScope } from './enums/index.mjs'

export type InjectionFactory<T = unknown, Args = unknown> = (
  ctx: FactoryContext,
  args: Args,
) => Promise<T>

export type FactoryRecord<Instance = any, Schema = any> = {
  scope: InjectableScope
  originalToken: InjectionToken<Instance, Schema>
  factory: InjectionFactory<
    Instance,
    Schema extends ZodObject<any> ? z.input<Schema> : unknown
  >
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
    factory: InjectionFactory,
    scope: InjectableScope,
  ) {
    this.factories.set(token.id, { factory, scope, originalToken: token })
  }

  delete(token: InjectionToken<any, any>) {
    this.factories.delete(token.id)
  }
}

export const globalRegistry = new Registry()
