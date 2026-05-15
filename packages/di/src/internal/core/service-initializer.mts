import { getInjections, InjectionKind } from '../../decorators/injection-metadata.mjs'
import { InjectableType } from '../../enums/index.mjs'
import { DIError } from '../../errors/index.mjs'

import type { InjectionEntry } from '../../decorators/injection-metadata.mjs'
import type { FactoryRecord } from '../../token/registry.mjs'
import type { ClassType } from '../../token/token.mjs'
import type { ServiceInitializationContext } from '../context/service-initialization-context.mjs'

/**
 * Creates service instances from registry records.
 *
 * Handles both class-based (@Injectable) and factory-based (@Factory) services,
 * managing the instantiation lifecycle including lifecycle hook invocation.
 *
 * v2 model: one-pass, metadata-driven resolution. The class' `@Inject*`
 * accessor fields are read from injection metadata, the dependencies are
 * resolved through the resolution context, the instance is constructed
 * EXACTLY ONCE, and the resolved values are assigned onto the accessor
 * fields. No constructor re-run, no throw-proxy, no frozen-replay.
 */
export class ServiceInitializer {
  /**
   * Instantiates a service based on its registry record.
   * @param ctx The factory context for dependency injection
   * @param record The factory record from the registry
   * @param args Optional arguments for the service
   * @returns Promise resolving to [undefined, instance] or [error]
   */
  async instantiateService<T>(
    ctx: ServiceInitializationContext,
    record: FactoryRecord<T, any>,
    args: any = undefined,
  ): Promise<[undefined, T] | [DIError]> {
    try {
      switch (record.type) {
        case InjectableType.Class:
          return await this.instantiateClass(ctx, record, args)
        case InjectableType.Factory:
          return await this.instantiateFactory(ctx, record, args)
        default:
          throw DIError.unknown(`[ServiceInitializer] Unknown service type: ${record.type}`)
      }
    } catch (error) {
      return [
        error instanceof DIError
          ? error
          : DIError.initializationError(record.target.name, error as Error),
      ]
    }
  }

  /**
   * Resolves all `@Inject*` accessor fields declared on a target class
   * (including inherited ones, via {@link getInjections}).
   *
   * - Eager + Derived: resolved in parallel and awaited before construction.
   * - Optional: resolved, then `.catch(() => null)`, then settled before
   *   construction (the field holds `Dep | null`).
   * - Lazy: the field holds a `Promise<Dep>` that is NOT awaited here, so
   *   construction never blocks on it.
   *
   * @returns Map of fieldName -> resolved value (or Promise for Lazy).
   */
  private async resolveInjections(
    ctx: ServiceInitializationContext,
    target: ClassType,
    hostArgs: unknown,
  ): Promise<Map<string | symbol, unknown>> {
    const entries = getInjections(target)
    const resolved = new Map<string | symbol, unknown>()

    const eagerOrDerived: InjectionEntry[] = []
    for (const entry of entries) {
      if (entry.kind === InjectionKind.Eager || entry.kind === InjectionKind.Derived) {
        eagerOrDerived.push(entry)
      }
    }

    const eagerResults = await Promise.all(
      eagerOrDerived.map(async (entry) => {
        const depArgs =
          entry.kind === InjectionKind.Derived ? entry.derive(hostArgs) : entry.args
        const value = await ctx.inject(entry.token as any, depArgs as any)
        return [entry.fieldName, value] as const
      }),
    )
    for (const [fieldName, value] of eagerResults) {
      resolved.set(fieldName, value)
    }

    const optionalPending: Array<[string | symbol, Promise<unknown>]> = []
    for (const entry of entries) {
      if (entry.kind === InjectionKind.Lazy) {
        // Lazy: field holds the unresolved promise; do not block construction.
        const lazyPromise = ctx.inject(entry.token as any, entry.args as any)
        // Attach a no-op catch so Node does not flag unhandledRejection if the
        // consumer never awaits this lazy field. The consumer still observes the
        // live rejection when they await `this.field` (they hold `lazyPromise`).
        lazyPromise.catch(() => undefined)
        resolved.set(entry.fieldName, lazyPromise)
      } else if (entry.kind === InjectionKind.Optional) {
        // @InjectOptional yields null when the dependency is unavailable for ANY
        // reason — not registered, or registered but its construction failed.
        // This matches the documented optional-injection contract.
        optionalPending.push([
          entry.fieldName,
          ctx.inject(entry.token as any, entry.args as any).catch(() => null),
        ])
      }
    }

    // Settle the optionals so the field holds `Dep | null` before construction.
    for (const [fieldName, pending] of optionalPending) {
      resolved.set(fieldName, await pending)
    }

    return resolved
  }

  /**
   * Instantiates a class-based service (Injectable decorator).
   *
   * One-pass: resolve deps, construct ONCE, assign fields, run hooks.
   */
  private async instantiateClass<T>(
    ctx: ServiceInitializationContext,
    record: FactoryRecord<T, any>,
    args: any,
  ): Promise<[undefined, T] | [DIError]> {
    const resolved = await this.resolveInjections(ctx, record.target, args)

    const instance = new record.target(...(args !== undefined ? [args] : [])) as any

    for (const [field, value] of resolved) {
      instance[field] = value
    }

    if (typeof instance.onServiceInit === 'function') {
      await instance.onServiceInit()
    }
    if (typeof instance.onServiceDestroy === 'function') {
      ctx.addDestroyListener(async () => {
        await instance.onServiceDestroy()
      })
    }

    return [undefined, instance as T]
  }

  /**
   * Instantiates a factory-based service (Factory decorator).
   *
   * Resolves the factory class' own `@Inject*` fields the same way, then
   * delegates instance creation to `builder.create(ctx, args)`.
   */
  private async instantiateFactory<T>(
    ctx: ServiceInitializationContext,
    record: FactoryRecord<T, any>,
    args: any,
  ): Promise<[undefined, T] | [DIError]> {
    const resolved = await this.resolveInjections(ctx, record.target, args)

    const builder = new record.target() as any

    for (const [field, value] of resolved) {
      builder[field] = value
    }

    if (typeof builder.create !== 'function') {
      throw DIError.initializationError(
        record.target.name,
        new Error('Factory does not implement the create method'),
      )
    }

    const instance = await builder.create(ctx, args)
    return [undefined, instance as T]
  }
}
