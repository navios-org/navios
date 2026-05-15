import { addInjectionToMetadata, InjectionKind } from './injection-metadata.mjs'

import type { BoundToken, ClassType, FactoryToken, Token } from '../token/token.mjs'

type AnyTokenOrClass = Token<any, any> | BoundToken<any, any> | FactoryToken<any, any> | ClassType

export function InjectDerived<TDep, THostArgs>(
  token: AnyTokenOrClass,
  derive: (hostArgs: THostArgs) => unknown,
) {
  return (
    _target: ClassAccessorDecoratorTarget<unknown, TDep>,
    context: ClassAccessorDecoratorContext<unknown, TDep>,
  ): ClassAccessorDecoratorResult<unknown, TDep> | void => {
    if (context.kind !== 'accessor') {
      throw new Error(
        '[DI] @InjectDerived must be applied to an accessor field (`accessor foo!: Foo`).',
      )
    }
    if (!context.metadata) {
      throw new Error('[DI] @InjectDerived requires decorator metadata support (`context.metadata`).')
    }
    // Register at decoration time (not in addInitializer) so the metadata is
    // available without constructing an instance. Stage-3 member decorators do
    // not expose the class, but `context.metadata` is the shared per-class
    // object the runtime attaches as `Class[Symbol.metadata]`.
    addInjectionToMetadata(context.metadata, {
      kind: InjectionKind.Derived,
      fieldName: context.name,
      token,
      derive: derive as (a: unknown) => unknown,
    })
  }
}
