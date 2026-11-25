import type { Schema, StandardIssue } from './schema.mjs'

export type ZodResult =
  | { success: true; data: unknown }
  | { success: false; error: { issues: readonly StandardIssue[] } }

export interface ZodPayload {
  value: unknown
  issues: unknown[]
}

type Definition = Record<string, unknown>

export interface Zod3Schema extends Schema {
  _def: object
  safeParse(value: unknown): ZodResult
  safeParseAsync(value: unknown): Promise<ZodResult>
}

/** A Zod 4 schema: classic, mini or core, which has no `safeParse`. */
export interface Zod4Schema extends Schema {
  safeParse?(value: unknown): ZodResult
  _zod: {
    def: object
    traits?: ReadonlySet<string>
    constr: new (def: object) => Zod4Schema
    run(payload: ZodPayload, ctx: { async?: boolean }): ZodPayload | Promise<ZodPayload>
  }
}

export function isZod3(schema: Schema): schema is Zod3Schema {
  const { _def, safeParse, safeParseAsync } = schema as Partial<Zod3Schema>
  return (
    typeof (_def as Definition | undefined)?.typeName === 'string' &&
    typeof safeParse === 'function' &&
    typeof safeParseAsync === 'function'
  )
}

export function isZod4(schema: Schema): schema is Zod4Schema {
  const { _zod } = schema as Partial<Zod4Schema>
  return typeof _zod?.run === 'function' && typeof _zod.constr === 'function'
}

/** What can make a schema asynchronous. */
export interface AsyncScan {
  /** It runs functions of the user, or waits for a promise. */
  userCode: boolean
  /** It is known to be asynchronous. */
  asynchronous: boolean
  /**
   * It is validated synchronously only when that is asked for, and then throws
   * on meeting a promise: Zod 3, and the transforms of Zod Mini and core. The
   * rest of Zod 4 is as synchronous as its functions are either way.
   */
  onDemand: boolean
  /** The functions whose promise is dropped then: the key of a definition. */
  dropping: (readonly [owner: Definition, key: string])[]
}

/** Definitions of Zod 4 that run a function of the user, or wait for a promise. */
const USER_CODE: ReadonlySet<unknown> = new Set(['custom', 'transform', 'lazy', 'promise'])

/** Types of Zod 3 that wait for a promise, or whose schema is not known. So is a class of the user. */
const OPAQUE_ZOD3: ReadonlySet<unknown> = new Set(['ZodLazy', 'ZodPromise'])

/** Keys of a definition that are no schemas; reading `defaultValue` calls the user's function. */
const SKIPPED_KEYS: ReadonlySet<string> = new Set(['defaultValue', 'catchValue', 'error'])

// Where the search ends: a schema that is made anew wherever it recurs has no end
const MAX_DEPTH = 500
const MAX_NODES = 10_000

function addDropping(scan: AsyncScan, owner: Definition, key: string): void {
  scan.onDemand = true
  if (Object.prototype.toString.call(owner[key]) === '[object AsyncFunction]') {
    scan.asynchronous = true
  }
  if (!Object.isFrozen(owner)) scan.dropping.push([owner, key])
}

function inspectZod4(scan: AsyncScan, node: Zod4Schema, def: Definition): void {
  // A codec is a `pipe` with a function of its own
  if (!USER_CODE.has(def.type) && def.check !== 'custom' && !('transform' in def)) return
  scan.userCode = true
  if (def.type === 'lazy') {
    scan.onDemand = true
  } else if (def.type === 'transform' && !node._zod.traits?.has('ZodTransform')) {
    addDropping(scan, def, 'transform')
  }
}

function inspectZod3(scan: AsyncScan, def: Definition): void {
  scan.onDemand = true
  if (def.typeName === 'ZodEffects') {
    scan.userCode = true
    const effect = def.effect as Definition
    addDropping(scan, effect, effect.type === 'refinement' ? 'refinement' : 'transform')
  } else if (OPAQUE_ZOD3.has(def.typeName) || !String(def.typeName).startsWith('Zod')) {
    scan.userCode = true
  }
}

function search(schema: Schema): AsyncScan {
  const scan: AsyncScan = { userCode: false, asynchronous: false, onDemand: false, dropping: [] }
  const depths = new Map<object, number>([[schema, 0]])
  // The loop also visits what is added meanwhile
  for (const [node, depth] of depths) {
    const add = (value: unknown) => {
      if (typeof value !== 'object' || value === null || depths.has(value)) return
      depths.set(value, depth + 1)
    }
    if (depth > MAX_DEPTH || depths.size > MAX_NODES) {
      scan.userCode = scan.onDemand = true
      break
    }
    const zod4 = (node as Partial<Zod4Schema>)._zod?.def as Definition | undefined
    const zod3 = zod4 ? undefined : (node as { _def?: Definition })._def
    if (zod4) inspectZod4(scan, node as Zod4Schema, zod4)
    else if (zod3) inspectZod3(scan, zod3)

    const container = zod4 ?? zod3 ?? (node as Definition)
    for (const key of Object.keys(container)) {
      if (!SKIPPED_KEYS.has(key)) add(container[key])
    }
    // The object schemas of Zod 3
    if (zod3 && typeof zod3.shape === 'function') add(zod3.shape())
  }
  return scan
}

const scans = new WeakMap<Schema, AsyncScan>()

/**
 * Finds out, once, what can make a schema asynchronous.
 *
 * Trying it out is not an option: on meeting an asynchronous check in a
 * synchronous run, Zod throws and drops the promise of the check. The check runs
 * again afterwards, and if the promise rejects nobody handles it and Node ends
 * the process. So the definition is searched for functions of the user, the only
 * place a promise can come from.
 */
export function scanZod(schema: Schema): AsyncScan {
  let scan = scans.get(schema)
  if (!scan) scans.set(schema, (scan = search(schema)))
  return scan
}

/**
 * Validates a schema that is synchronous on demand. Returns `null` when it turned
 * out to be asynchronous, and it has to be validated as that.
 *
 * Its functions are watched meanwhile, to handle the promise Zod drops.
 */
export function trySync<T>({ dropping }: AsyncScan, parse: () => T): T | null {
  let promised = false
  const originals = dropping.map(([owner, key]) => owner[key] as (...args: unknown[]) => unknown)
  dropping.forEach(([owner, key], index) => {
    owner[key] = (...args: unknown[]) => {
      const result = originals[index]!(...args)
      if (result instanceof Promise) {
        promised = true
        result.catch(() => {})
      }
      return result
    }
  })
  try {
    const result = parse()
    return promised ? null : result
  } catch (error) {
    // What Zod throws says "encountered": "Encountered Promise during synchronous
    // parse", "Async refinement encountered during synchronous parse operation"
    if (promised || (error instanceof Error && /encountered/i.test(error.message))) return null
    throw error
  } finally {
    dropping.forEach(([owner, key], index) => {
      owner[key] = originals[index]
    })
  }
}

/**
 * A copy of a schema that produces `payload`, whatever it validates. Only a schema
 * can turn the payload of its `run` into a `ZodError`, and this one does it without
 * running the checks again.
 */
export function replayZod4(schema: Zod4Schema, payload: ZodPayload): Zod4Schema {
  const replay = new schema._zod.constr(schema._zod.def)
  replay._zod.run = () => payload
  return replay
}
