import type { IContainer } from '../container/i-container.mjs'
import type { ProviderRecord } from '../provider/provider-record.mjs'
import type { FactoryInjectionToken, InjectionToken } from '../token/injection-token.mjs'

import type { Entry } from './entry.mjs'
import type { Store } from './store.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

export type InstanceDecorator = (
  instance: any,
  info: { token: InjectionToken<any, any>; args: unknown },
) => unknown

export interface FactoryValue {
  done: boolean
  value: unknown
  promise: Promise<void> | null
}

/**
 * What the engine needs from a container. Both `Container` and
 * `ScopedContainer` implement it.
 * @internal
 */
export interface Host {
  readonly root: RootHost
  readonly store: Store
  readonly isScope: boolean
  /** The public container, handed to factories. */
  readonly facade: IContainer
  /** Transients built by a top-level `get` on a scope that need destroying. */
  looseTransients: Entry[] | null
}

/** @internal */
export interface RootHost extends Host {
  readonly overrides: Map<InjectionToken<any, any>, ProviderRecord>
  /**
   * When `true`, only providers given to this container are used; the
   * defaults registered on tokens are ignored. Used by `UnitTestContainer`.
   */
  readonly strict: boolean
  decorators: Map<InjectionToken<any, any>, InstanceDecorator[]> | null
  readonly factoryValues: Map<FactoryInjectionToken<any, any>, FactoryValue>
  /**
   * Asked by a strict container for a token none of its providers covers,
   * wherever the request comes from. `undefined` leaves the token unprovided.
   */
  providerForUnlisted(token: InjectionToken<any, any>): ProviderRecord | undefined
}
