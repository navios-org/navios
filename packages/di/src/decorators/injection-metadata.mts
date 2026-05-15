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

// Stage-3 member decorators (e.g. `@Inject accessor x`) cannot see the class
// at decoration time, so they cannot use the class-keyed WeakMap. They instead
// write into the per-class `context.metadata` object, which the runtime
// attaches as `Class[Symbol.metadata]`.
//
// `Symbol.metadata` is not defined in older Node versions / some SWC transform
// configs. The TC39 Stage-3 decorator transform only attaches the per-class
// metadata object to `Class[Symbol.metadata]` when this symbol already exists
// on `Symbol`. Polyfill idempotently so decoration-time metadata writes (used
// by every @Inject* decorator) are never silently dropped.
const symbolWithMetadata = Symbol as unknown as { metadata?: symbol }
symbolWithMetadata.metadata ??= Symbol.for('Symbol.metadata')
const METADATA_SYMBOL = symbolWithMetadata.metadata
const METADATA_KEY = Symbol.for('@navios/di:injections')

interface InjectionMetadata {
  [METADATA_KEY]?: InjectionEntry[]
}

/**
 * Registers an injection into the WeakMap store (programmatic / legacy path).
 * NOT used by `@Inject` or the other field decorators — those write via
 * {@link addInjectionToMetadata} into `Class[Symbol.metadata]`. Retained for
 * programmatic registration and Task 3.1 metadata consolidation.
 */
export function registerInjection(target: ClassType, entry: InjectionEntry): void {
  let list = STORE.get(target)
  if (!list) {
    list = []
    STORE.set(target, list)
  }
  list.push(entry)
}

/**
 * Adds an injection entry to a Stage-3 decorator's `context.metadata` object.
 * Used by member decorators that lack a class reference at decoration time.
 */
export function addInjectionToMetadata(
  metadata: DecoratorMetadataObject,
  entry: InjectionEntry,
): void {
  const store = metadata as InjectionMetadata
  let list = store[METADATA_KEY]
  if (!list) {
    list = []
    store[METADATA_KEY] = list
  }
  list.push(entry)
}

export function getInjections(target: ClassType): readonly InjectionEntry[] {
  const fromStore = STORE.get(target) ?? []
  const metadata = (target as unknown as Record<symbol, unknown>)[METADATA_SYMBOL] as
    | InjectionMetadata
    | undefined
  const fromMetadata = metadata?.[METADATA_KEY] ?? []
  if (fromStore.length === 0) {
    return fromMetadata
  }
  if (fromMetadata.length === 0) {
    return fromStore
  }
  return [...fromStore, ...fromMetadata]
}
