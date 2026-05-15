import type { BoundToken, ClassType, FactoryToken, Token } from '../token/token.mjs'

export enum InjectionKind {
  Eager = 'eager',
  Lazy = 'lazy',
  Optional = 'optional',
  Derived = 'derived',
}

type AnyToken = Token<any, any> | BoundToken<any, any> | FactoryToken<any, any>

export interface InjectionEntryEager {
  kind: InjectionKind.Eager
  fieldName: string | symbol
  token: AnyToken | ClassType
  args?: unknown
}
export interface InjectionEntryLazy {
  kind: InjectionKind.Lazy
  fieldName: string | symbol
  token: AnyToken | ClassType
  args?: unknown
}
export interface InjectionEntryOptional {
  kind: InjectionKind.Optional
  fieldName: string | symbol
  token: AnyToken | ClassType
  args?: unknown
}
export interface InjectionEntryDerived {
  kind: InjectionKind.Derived
  fieldName: string | symbol
  token: AnyToken | ClassType
  derive: (hostArgs: unknown) => unknown
}

export type InjectionEntry =
  | InjectionEntryEager
  | InjectionEntryLazy
  | InjectionEntryOptional
  | InjectionEntryDerived

const STORE = new WeakMap<ClassType, InjectionEntry[]>()

export function registerInjection(target: ClassType, entry: InjectionEntry): void {
  let list = STORE.get(target)
  if (!list) {
    list = []
    STORE.set(target, list)
  }
  list.push(entry)
}

export function getInjections(target: ClassType): readonly InjectionEntry[] {
  return STORE.get(target) ?? []
}
