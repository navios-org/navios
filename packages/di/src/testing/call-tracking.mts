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
 * Creates a tracking proxy that records method calls.
 */
export function createTrackingProxy<T extends object>(
  target: T,
  tokenId: Token,
  methodCalls: Map<Token, MethodCallRecord[]>,
): T {
  return new Proxy(target, {
    get(obj, prop) {
      const value = Reflect.get(obj, prop)

      if (typeof value === 'function' && typeof prop === 'string') {
        return function (this: unknown, ...args: unknown[]) {
          const calls = methodCalls.get(tokenId) || []
          const record: MethodCallRecord = {
            method: prop,
            args,
            timestamp: Date.now(),
          }

          try {
            const result = value.apply(this === undefined ? obj : this, args)

            if (result instanceof Promise) {
              return result
                .then((res) => {
                  record.result = res
                  calls.push(record)
                  methodCalls.set(tokenId, calls)
                  return res
                })
                .catch((err) => {
                  record.error = err
                  calls.push(record)
                  methodCalls.set(tokenId, calls)
                  throw err
                })
            }

            record.result = result
            calls.push(record)
            methodCalls.set(tokenId, calls)
            return result
          } catch (err) {
            record.error = err as Error
            calls.push(record)
            methodCalls.set(tokenId, calls)
            throw err
          }
        }
      }

      return value
    },
  })
}

/**
 * Whether recorded call arguments equal the expected ones. Objects are
 * compared by their JSON form, everything else by identity.
 */
export function argsMatch(actual: unknown[], expected: unknown[]): boolean {
  if (actual.length !== expected.length) {
    return false
  }
  return actual.every((arg, index) => {
    const exp = expected[index]
    if (typeof exp === 'object' && exp !== null) {
      return JSON.stringify(arg) === JSON.stringify(exp)
    }
    return arg === exp
  })
}
