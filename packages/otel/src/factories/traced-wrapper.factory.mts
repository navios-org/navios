import { Factory, inject } from '@navios/di'

import type {
  ClassTypeWithInstance,
  Factorable,
  FactoryContext,
  InjectionToken,
  InjectionTokenSchemaType,
} from '@navios/di'

import { TracedProxyFactory } from '../services/traced-proxy.factory.mjs'

/**
 * Creates a factory class that wraps a traced service with a tracing proxy.
 *
 * This function dynamically creates a factory that:
 * 1. Resolves the original service using the provided token
 * 2. Wraps it with a tracing proxy using TracedProxyFactory
 * 3. Forwards any arguments to the original service resolution
 *
 * @param OriginalServiceToken - Token to resolve the unwrapped original service
 * @param OriginalServiceClass - The class type for metadata extraction
 * @returns A factory class that produces wrapped instances
 *
 * @example
 * ```typescript
 * const originalToken = InjectionToken.create('MyService:original')
 * const WrapperFactory = createTracedWrapperFactory(originalToken, MyService)
 *
 * // Register in DI
 * registry.set(myServiceToken, scope, WrapperFactory, InjectableType.Factory, priority + 1)
 * ```
 */
export function createTracedWrapperFactory<
  T extends object,
  S extends InjectionTokenSchemaType | undefined = undefined,
>(
  OriginalServiceToken: InjectionToken<T, S>,
  OriginalServiceClass: ClassTypeWithInstance<T>,
): ClassTypeWithInstance<Factorable<T>> {
  @Factory()
  class TracedWrapperFactory implements Factorable<T> {
    private readonly proxyFactory = inject(TracedProxyFactory)

    async create(ctx: FactoryContext, args?: unknown): Promise<T> {
      // Forward args to inject - important for parameterized services
      // @ts-expect-error - args is unknown
      const original = await ctx.inject(OriginalServiceToken, args)
      return this.proxyFactory.wrap(original, OriginalServiceClass)
    }
  }

  return TracedWrapperFactory
}
