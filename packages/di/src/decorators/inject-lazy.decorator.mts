import { addInjectionToMetadata, InjectionKind } from './injection-metadata.mjs'

import type { BoundToken, ClassType, FactoryToken, Token } from '../token/token.mjs'

type AnyTokenOrClass = Token<any, any> | BoundToken<any, any> | FactoryToken<any, any> | ClassType

export function InjectLazy<T>(token: AnyTokenOrClass, args?: unknown) {
  return (
    _target: ClassAccessorDecoratorTarget<unknown, Promise<T>>,
    context: ClassAccessorDecoratorContext<unknown, Promise<T>>,
  ): ClassAccessorDecoratorResult<unknown, Promise<T>> | void => {
    if (context.kind !== 'accessor') {
      throw new Error(
        '[DI] @InjectLazy must be applied to an accessor field (`accessor foo!: Promise<Foo>`).',
      )
    }
    if (!context.metadata) {
      throw new Error('[DI] @InjectLazy requires decorator metadata support (`context.metadata`).')
    }
    // Register at decoration time (not in addInitializer) so the metadata is
    // available without constructing an instance. Stage-3 member decorators do
    // not expose the class, but `context.metadata` is the shared per-class
    // object the runtime attaches as `Class[Symbol.metadata]`.
    addInjectionToMetadata(context.metadata, {
      kind: InjectionKind.Lazy,
      fieldName: context.name,
      token,
      args,
    })
  }
}
