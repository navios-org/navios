import type { InjectionToken } from '../token/injection-token.mjs'

type Token = InjectionToken<any, any>

/**
 * Tracks method calls on a mocked service.
 */
export interface MethodCallRecord {
  method: string
  args: unknown[]
  timestamp: number
  result?: unknown
  error?: Error
}

/**
 * Tracks lifecycle events for a service.
 */
export interface LifecycleRecord {
  event: 'created' | 'initialized' | 'destroyed'
  timestamp: number
  /** The token's name (`token.toString()`), or whatever the recorder passed. */
  instanceName: string
}

/**
 * Statistics about a mocked service.
 */
export interface MockServiceStats {
  instanceCount: number
  methodCalls: MethodCallRecord[]
  lifecycleEvents: LifecycleRecord[]
}

/**
 * Creates a tracking proxy that records method calls. A call that another
 * method of the same instance makes is not seen: methods run on the instance
 * itself, because `#private` members do not exist on a proxy.
 */
export function createTrackingProxy<T extends object>(
  target: T,
  tokenId: Token,
  methodCalls: Map<Token, MethodCallRecord[]>,
): T {
  // One wrapper per method, so that `service.method === service.method`.
  const wrappers = new Map<PropertyKey, { method: unknown; wrapper: unknown }>()

  const record = (method: string, args: unknown[]): MethodCallRecord => {
    const call: MethodCallRecord = { method, args, timestamp: Date.now() }
    const calls = methodCalls.get(tokenId)
    if (calls === undefined) {
      methodCalls.set(tokenId, [call])
    } else {
      calls.push(call)
    }
    return call
  }

  const invoke = (method: Function, prop: PropertyKey, self: unknown, args: unknown[]): unknown => {
    const call = typeof prop === 'string' ? record(prop, args) : undefined
    let result: unknown
    try {
      result = Reflect.apply(method, self === undefined || self === proxy ? target : self, args)
    } catch (error) {
      if (call !== undefined) {
        call.error = error as Error
      }
      throw error
    }
    if (call === undefined) {
      return result
    }
    if (result instanceof Promise) {
      return result.then(
        (value) => {
          call.result = value
          return value
        },
        (error) => {
          call.error = error
          throw error
        },
      )
    }
    call.result = result
    return result
  }

  const proxy: T = new Proxy(target, {
    get(_, prop) {
      const value = Reflect.get(target, prop, target)
      if (typeof value !== 'function' || prop === 'constructor' || isFixed(target, prop)) {
        return value
      }
      let known = wrappers.get(prop)
      if (known === undefined || known.method !== value) {
        // A proxy of the function keeps what the function carries, such as
        // the `mock` of a spy, and stays a constructor if it is one.
        const wrapper = new Proxy(value, {
          apply: (method, self, args) => invoke(method, prop, self, args),
        })
        known = { method: value, wrapper }
        wrappers.set(prop, known)
      }
      return known.wrapper
    },
    set(_, prop, value) {
      return Reflect.set(target, prop, value, target)
    },
  })
  return proxy
}

/** Whether a proxy has to return a property as it is. */
function isFixed(target: object, prop: PropertyKey): boolean {
  const descriptor = Reflect.getOwnPropertyDescriptor(target, prop)
  return descriptor !== undefined && !descriptor.configurable && !descriptor.writable
}

/** Whether recorded call arguments equal the expected ones, by value. */
export function argsMatch(actual: unknown[], expected: unknown[]): boolean {
  return actual.length === expected.length && isEqual(actual, expected, [])
}

/** Call arguments as they appear in a failed assertion. */
export function formatArgs(args: unknown[]): string {
  try {
    return JSON.stringify(args)
  } catch {
    // Cyclic, or with a bigint.
    const shown = args.map((arg) =>
      typeof arg === 'object' ? Object.prototype.toString.call(arg) : String(arg),
    )
    return `[${shown.join(', ')}]`
  }
}

const tagOf = (value: object): string => Object.prototype.toString.call(value)

const bytesOf = (value: ArrayBuffer | ArrayBufferView): number[] =>
  Array.from(
    ArrayBuffer.isView(value)
      ? new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
      : new Uint8Array(value),
  )

function isPlain(value: object): boolean {
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/** `compared` holds the pairs around this one, which a cycle leads back to. */
function isEqual(actual: unknown, expected: unknown, compared: [unknown, unknown][]): boolean {
  if (Object.is(actual, expected)) {
    return true
  }
  if (
    typeof expected !== 'object' ||
    expected === null ||
    typeof actual !== 'object' ||
    actual === null ||
    tagOf(actual) !== tagOf(expected)
  ) {
    return false
  }
  const sameClass = Object.getPrototypeOf(actual) === Object.getPrototypeOf(expected)
  // A class instance may be expected as what it looks like.
  if (!sameClass && !isPlain(actual) && !isPlain(expected)) {
    return false
  }
  if (compared.some(([left, right]) => left === actual && right === expected)) {
    return true
  }
  const inside: [unknown, unknown][] = [...compared, [actual, expected]]
  const equal = (left: unknown, right: unknown) => isEqual(left, right, inside)

  if (ArrayBuffer.isView(expected) || expected instanceof ArrayBuffer) {
    return equal(bytesOf(actual as ArrayBuffer), bytesOf(expected))
  }
  switch (tagOf(expected)) {
    case '[object Array]':
      return (
        (actual as unknown[]).length === (expected as unknown[]).length &&
        Array.from(expected as unknown[]).every((item, index) =>
          equal((actual as unknown[])[index], item),
        )
      )
    case '[object Date]':
      return Object.is((actual as Date).getTime(), (expected as Date).getTime())
    case '[object RegExp]':
    case '[object URL]':
    case '[object URLSearchParams]':
      return String(actual) === String(expected)
    case '[object Map]':
    case '[object Set]':
      return haveEqualItems([...(actual as Set<unknown>)], [...(expected as Set<unknown>)], equal)
    case '[object Error]':
      if ((actual as Error).message !== (expected as Error).message) {
        return false
      }
      break
    default:
  }

  const keys = new Set([...Reflect.ownKeys(actual), ...Reflect.ownKeys(expected)])
  const enumerable = Array.from(keys).filter((key) =>
    [actual, expected].some((object) => Object.prototype.propertyIsEnumerable.call(object, key)),
  )
  const bothPlain = isPlain(actual) && isPlain(expected)
  if (enumerable.length === 0 && !bothPlain && tagOf(expected) !== '[object Error]') {
    // What it holds is private.
    const [left, right] = [actual, expected] as { toJSON?: unknown }[]
    return (
      sameClass &&
      typeof left.toJSON === 'function' &&
      typeof right.toJSON === 'function' &&
      equal(left.toJSON(), right.toJSON())
    )
  }
  // A property that is `undefined` counts as absent.
  return enumerable.every((key) =>
    equal(
      (actual as Record<PropertyKey, unknown>)[key],
      (expected as Record<PropertyKey, unknown>)[key],
    ),
  )
}

/** Whether each expected item has an actual one of its own, in any order. */
function haveEqualItems(
  actual: unknown[],
  expected: unknown[],
  equal: (left: unknown, right: unknown) => boolean,
): boolean {
  const left = [...actual]
  return (
    actual.length === expected.length &&
    expected.every((item) => {
      const index = left.findIndex((candidate) => equal(candidate, item))
      return index >= 0 && left.splice(index, 1).length === 1
    })
  )
}
