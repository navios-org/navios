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

// Stage-3 member decorators (e.g. `@Inject accessor x`) cannot see the class
// at decoration time, so they write into the per-class `context.metadata`
// object, which the runtime attaches as `Class[Symbol.metadata]`. This is the
// single canonical injection-metadata store (the legacy class-keyed WeakMap
// path was removed in the v2 overhaul — nothing used it).
//
// `Symbol.metadata` is not defined in older Node versions / some SWC transform
// configs. The TC39 Stage-3 decorator transform only attaches the per-class
// metadata object to `Class[Symbol.metadata]` when this symbol already exists
// on `Symbol`. Polyfill idempotently so decoration-time metadata writes (used
// by every @Inject* decorator) are never silently dropped. This MUST stay a
// load-bearing top-level side-effect: it runs before any decorated class is
// evaluated.
const symbolWithMetadata = Symbol as unknown as { metadata?: symbol }
symbolWithMetadata.metadata ??= Symbol.for('Symbol.metadata')
const METADATA_SYMBOL = symbolWithMetadata.metadata
const METADATA_KEY = Symbol.for('@navios/di:injections')

interface InjectionMetadata {
  [METADATA_KEY]?: InjectionEntry[]
}

/**
 * Adds an injection entry to a Stage-3 decorator's `context.metadata` object.
 * Used by member decorators that lack a class reference at decoration time.
 *
 * The TC39 spec makes a subclass's metadata object prototypically inherit the
 * parent's metadata object. A naive `metadata[METADATA_KEY]` read would find
 * the PARENT's array (via the prototype chain) and `.push` into it, mutating
 * the parent. To keep per-class isolation we only ever write into an OWN
 * property array on the decorated class's metadata bag: if the array is not an
 * own property we create a fresh own array (seeded empty — inherited parent
 * entries are merged at read time by {@link getInjections}, not copied here).
 */
export function addInjectionToMetadata(
  metadata: DecoratorMetadataObject,
  entry: InjectionEntry,
): void {
  const store = metadata as unknown as InjectionMetadata & object
  let list = Object.hasOwn(store, METADATA_KEY) ? store[METADATA_KEY] : undefined
  if (!list) {
    list = []
    store[METADATA_KEY] = list
  }
  list.push(entry)
}

/**
 * Returns the injection entries for a class, merging the prototype chain.
 *
 * A subclass instance has BOTH its own `@Inject*` accessor fields AND the
 * parent's, so resolution must populate both. We walk the metadata-object
 * prototype chain collecting each level's OWN array, then merge most-derived
 * over least-derived: parent entries first, child entries last, de-duped by
 * `fieldName` so a subclass re-declaring a parent field overrides it (no
 * duplicate, child wins).
 */
export function getInjections(target: ClassType): readonly InjectionEntry[] {
  const metadata = (target as unknown as Record<symbol, unknown>)[METADATA_SYMBOL] as
    | (InjectionMetadata & object)
    | undefined
  if (!metadata) {
    return []
  }

  // Collect each prototype level's OWN array, base-most first.
  const perLevel: InjectionEntry[][] = []
  let level: object | null = metadata
  while (level && level !== Object.prototype) {
    if (Object.hasOwn(level, METADATA_KEY)) {
      const own = (level as InjectionMetadata)[METADATA_KEY]
      if (own && own.length > 0) {
        perLevel.unshift(own)
      }
    }
    level = Object.getPrototypeOf(level)
  }

  if (perLevel.length === 0) {
    return []
  }
  if (perLevel.length === 1) {
    return perLevel[0]
  }

  // Merge least-derived -> most-derived, child overrides parent by fieldName.
  const byField = new Map<string | symbol, InjectionEntry>()
  for (const entries of perLevel) {
    for (const entry of entries) {
      byField.set(entry.fieldName, entry)
    }
  }
  return [...byField.values()]
}
