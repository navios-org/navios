import { Container } from '../container/container.mjs'
import { InjectableScope } from '../injectable-scope.mjs'
import { argOverrideKey, isResolved } from '../internal/lookup.mjs'
import { findReady } from '../internal/stored-values.mjs'
import { BoundInjectionToken } from '../token/injection-token.mjs'

import type { Provider } from '../provider/provide.mjs'
import type { ProviderRecord } from '../provider/provider-record.mjs'
import type { InjectionToken } from '../token/injection-token.mjs'

import { argsMatch, formatArgs } from './call-tracking.mjs'

import type { MethodCallRecord, MockServiceStats } from './call-tracking.mjs'

export type Token = InjectionToken<any, any>

export type AnyToken =
  | InjectionToken<any, any>
  | BoundInjectionToken<any, any>
  | (new (...args: any[]) => any)

/**
 * What `TestContainer` and `UnitTestContainer` share: the method calls they
 * record, and the assertions on what was resolved and called.
 */
export abstract class TrackingContainer extends Container {
  /** @internal */
  protected readonly methodCalls = new Map<Token, MethodCallRecord[]>()

  /**
   * The token that `token` stands for in assertions.
   * @internal
   */
  protected abstract resolveToken(token: AnyToken): Token

  /**
   * Destroys every resolved instance and forgets the recorded calls. What the
   * container was given to resolve stays in place.
   */
  async clear(): Promise<void> {
    await this.reset()
    this.methodCalls.clear()
  }

  /**
   * Asserts that a service has been resolved at least once.
   */
  expectResolved(token: AnyToken): void {
    const realToken = this.resolveToken(token)
    if (!isResolved(this, realToken)) {
      throw new Error(`Expected ${realToken.toString()} to be resolved, but it was not`)
    }
  }

  /**
   * Asserts that a service has NOT been resolved.
   */
  expectNotResolved(token: AnyToken): void {
    const realToken = this.resolveToken(token)
    if (isResolved(this, realToken)) {
      throw new Error(`Expected ${realToken.toString()} to NOT be resolved, but it was`)
    }
  }

  /**
   * Asserts that a call of the method was recorded for the token.
   */
  expectCalled(token: AnyToken, method: string): void {
    if (this.callsOf(token, method).length === 0) {
      throw new Error(`Expected ${this.nameOf(token)}.${method}() to be called, but it was not`)
    }
  }

  /**
   * Asserts that no call of the method was recorded for the token.
   */
  expectNotCalled(token: AnyToken, method: string): void {
    if (this.callsOf(token, method).length > 0) {
      throw new Error(`Expected ${this.nameOf(token)}.${method}() to NOT be called, but it was`)
    }
  }

  /**
   * Asserts that a call of the method with these arguments, compared by
   * value, was recorded for the token.
   */
  expectCalledWith(token: AnyToken, method: string, expectedArgs: unknown[]): void {
    const calls = this.callsOf(token, method)
    if (!calls.some((call) => argsMatch(call.args, expectedArgs))) {
      const actualArgs = calls.map((call) => formatArgs(call.args)).join(', ')
      throw new Error(
        `Expected ${this.nameOf(token)}.${method}() to be called with ${formatArgs(expectedArgs)}. ` +
          `Actual calls: [${actualArgs}]`,
      )
    }
  }

  /**
   * Asserts how many calls of the method were recorded for the token.
   */
  expectCallCount(token: AnyToken, method: string, count: number): void {
    const actualCount = this.callsOf(token, method).length
    if (actualCount !== count) {
      throw new Error(
        `Expected ${this.nameOf(token)}.${method}() to be called ${count} times, but was called ${actualCount} times`,
      )
    }
  }

  /**
   * The method calls recorded for a token.
   */
  getMethodCalls(token: AnyToken): MethodCallRecord[] {
    return this.methodCalls.get(this.resolveToken(token)) ?? []
  }

  /**
   * What was recorded for a token.
   */
  getServiceStats(token: AnyToken): MockServiceStats {
    return { methodCalls: this.getMethodCalls(token) }
  }

  /**
   * Forgets all recorded method calls.
   */
  clearMethodCalls(): void {
    this.methodCalls.clear()
  }

  /**
   * Makes `record` the provider for the args of `bound` alone: the other args
   * of its token keep the provider they have. Returns the key of the args.
   * @internal
   */
  protected setArgOverride(bound: BoundInjectionToken<any, any>, record: ProviderRecord): string {
    const key = argOverrideKey(bound)
    this.argOverrides ??= new Map()
    let byKey = this.argOverrides.get(bound.token)
    if (byKey === undefined) {
      byKey = new Map()
      this.argOverrides.set(bound.token, byKey)
    }
    byKey.set(key, record)
    return key
  }

  /**
   * Stores a value bound to a singleton token right away, so that it counts
   * as resolved before the first `get`. A token that needs args has no single
   * address to store the value under, and the value of another scope does not
   * belong in the root; both are served by the provider on resolution
   * instead.
   *
   * The value is stored as its provider would store it: unlike one given to
   * `addInstance()`, it is never destroyed.
   * @internal
   */
  protected storeBoundValue(token: AnyToken, provider: Provider, value: unknown): void {
    if (provider.record.scope !== InjectableScope.Singleton) {
      return
    }
    const address = token instanceof BoundInjectionToken ? token : provider.token
    if (address === provider.token && provider.token.schema !== undefined) {
      return
    }
    this.addInstance(address, value)
    const entry = findReady(this, address, undefined)
    if (entry !== undefined) {
      entry.destroyListeners = null
    }
  }

  private callsOf(token: AnyToken, method: string): MethodCallRecord[] {
    return this.getMethodCalls(token).filter((call) => call.method === method)
  }

  private nameOf(token: AnyToken): string {
    return this.resolveToken(token).toString()
  }
}
