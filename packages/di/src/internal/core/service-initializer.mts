import { getInjections, InjectionKind } from '../../decorators/injection-metadata.mjs'
import { InjectableType } from '../../enums/index.mjs'
import { DIError } from '../../errors/index.mjs'

import { validateScopeCompatibility } from './scope-validator.mjs'

import type { InjectionEntry } from '../../decorators/injection-metadata.mjs'
import type { FactoryRecord, Registry } from '../../token/registry.mjs'
import type { ClassType } from '../../token/token.mjs'
import type { ServiceInitializationContext } from '../context/service-initialization-context.mjs'
import type { TokenResolver } from './token-resolver.mjs'

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
   * @param registry Registry used by the fail-fast scope-compatibility check
   *   to look up each eager dependency's registered scope.
   * @param tokenResolver Resolves a dependency token/class to its registry
   *   token for that scope lookup.
   */
  constructor(
    private readonly registry: Registry,
    private readonly tokenResolver: TokenResolver,
  ) {}

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
   * - Lazy: the field holds a DEFERRED thenable. Resolution is not even
   *   initiated here — `ctx.inject()` runs only on first await, after the
   *   host has finished constructing. This is what lets @InjectLazy break
   *   circular dependencies.
   *
   * @returns Map of fieldName -> resolved value (or deferred thenable for Lazy).
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
        // Lazy: the field holds a DEFERRED thenable. `ctx.inject()` is NOT
        // called here (during resolveInjections, before the host instance has
        // finished constructing) — it is initiated only on first `.then`/await,
        // by which time the host is fully built. This is what makes
        // @InjectLazy break circular dependencies: a pure-lazy mutual cycle
        // resolves cleanly because both instances already exist when the field
        // is finally awaited. The inner promise is memoized so repeated awaits
        // yield the SAME instance. Nothing runs until awaited, so there is no
        // unhandled-rejection hazard for an un-awaited lazy field.
        // Register the dependency edge NOW (before construction completes and
        // before setupDependencySubscriptions runs) without resolving it, so
        // event-based cascade invalidation still works through the lazy edge.
        ctx.registerDependency(entry.token as any, entry.args as any)

        let pending: Promise<unknown> | undefined
        const lazyToken = entry.token
        const lazyArgs = entry.args
        const start = (): Promise<unknown> =>
          (pending ??= ctx.inject(lazyToken as any, lazyArgs as any))
        // The deferred thenable is the entire mechanism: `start()` (and
        // therefore `ctx.inject`) runs only when this object is awaited,
        // which is what breaks circular dependencies. `catch`/`finally` are
        // provided so it behaves like a real Promise for consumers.
        // Symbol.toStringTag is cosmetic only (DevTools / util.inspect); await
        // and thenable-detection key off .then, not this tag.
        /* oxlint-disable no-thenable */
        const lazy: Promise<unknown> = {
          then(onFulfilled, onRejected) {
            return start().then(onFulfilled, onRejected)
          },
          catch(onRejected) {
            return start().catch(onRejected)
          },
          finally(onFinally) {
            return start().finally(onFinally)
          },
          get [Symbol.toStringTag]() {
            return 'Promise'
          },
        } as Promise<unknown>
        /* oxlint-enable no-thenable */
        resolved.set(entry.fieldName, lazy)
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
    validateScopeCompatibility(
      record.target,
      ctx.scope,
      this.registry,
      this.tokenResolver,
    )

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
    validateScopeCompatibility(
      record.target,
      ctx.scope,
      this.registry,
      this.tokenResolver,
    )

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
