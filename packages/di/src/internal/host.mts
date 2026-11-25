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

/** Told what a destroy hook or a listener threw, and whose it was. */
export type ErrorReporter = (error: unknown, description: string) => void

/**
 * What the engine needs from a container. `Container` and `ScopedContainer`
 * have this shape; their published types do not show it.
 */
export interface Host {
  readonly root: RootHost
  readonly store: Store
  readonly isScope: boolean
  /** The public container, handed to factories. */
  readonly facade: IContainer
  /** Set when disposal starts; nothing may be built here afterwards. */
  readonly disposed: boolean
  /** Transients nobody else destroys: those a scope handed out by `get`. */
  looseTransients: Entry[] | null
  /** Work nobody awaits, which the disposal has to wait for. */
  background: Set<Promise<unknown>> | null
  /** Transients in the making. No store lists them. */
  building: Set<Entry> | null
}

export interface RootHost extends Host {
  readonly overrides: Map<InjectionToken<any, any>, ProviderRecord>
  /**
   * When `true`, only providers given to this container are used; the
   * defaults registered on tokens are ignored. Used by `UnitTestContainer`.
   */
  readonly strict: boolean
  decorators: Map<InjectionToken<any, any>, InstanceDecorator[]> | null
  /** The aliases that something was asked for by. */
  usedAliases: Set<InjectionToken<any, any>> | null
  /** The args that factory tokens computed. */
  readonly factoryValues: Map<FactoryInjectionToken<any, any>, Entry>
  /** `null` drops the errors. */
  reportError: ErrorReporter | null
  /**
   * Asked by a strict container for a token none of its providers covers,
   * wherever the request comes from. `undefined` leaves the token unprovided.
   */
  providerForUnlisted(token: InjectionToken<any, any>): ProviderRecord | undefined
}
