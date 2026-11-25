import { InjectableScope } from '../injectable-scope.mjs'
import { validateSync } from '../schema/standard-schema.mjs'

import type { PlanEntry } from '../provider/provider-record.mjs'
import type { InjectionToken } from '../token/injection-token.mjs'

import { argsKey } from './args-key.mjs'
import { EntryStatus, isLeaving } from './entry.mjs'
import { lookupRecord } from './normalize.mjs'

import type { Entry } from './entry.mjs'
import type { Host } from './host.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Whether something that a build in `host` could ask for is being destroyed.
 * It reaches its own store and the root's, so the teardown of another scope
 * or container does not slow it down.
 */
export function isDestroying(host: Host): boolean {
  return host.store.destroying > 0 || (host.isScope && host.root.store.destroying > 0)
}

/**
 * The entry stored for a token requested without args in `host` or its root,
 * in whatever state it is. Builds nothing.
 */
function stored(host: Host, token: InjectionToken<any, any>): Entry | undefined {
  let args: unknown
  if (token.schema !== undefined) {
    try {
      args = validateSync(token.schema, undefined, token.toString())
    } catch {
      return undefined
    }
  }
  const key = args === undefined ? null : argsKey(args)
  return (host.isScope ? host.store.get(token, key) : undefined) ?? host.root.store.get(token, key)
}

function collectLeaving(
  host: Host,
  plan: PlanEntry[],
  seen: Set<PlanEntry[]>,
  leaving: Entry[],
): void {
  seen.add(plan)
  for (const request of plan) {
    const entry = stored(host, request.token)
    if (entry !== undefined && isLeaving(entry)) {
      leaving.push(entry)
      continue
    }
    if (entry !== undefined && entry.status <= EntryStatus.Ready) {
      continue
    }
    // Not there: it is going to be built, and its own dependencies matter.
    const record = lookupRecord(host, request.token)
    if (record === undefined || record.plan === null || seen.has(record.plan)) {
      continue
    }
    collectLeaving(
      record.scope === InjectableScope.Singleton ? host.root : host,
      record.plan,
      seen,
      leaving,
    )
  }
}

/**
 * What building something with `plan` would find being destroyed, directly or
 * through dependencies that have to be built first; `null` when there is none.
 */
export function leavingIn(host: Host, plan: PlanEntry[]): Entry[] | null {
  const leaving: Entry[] = []
  collectLeaving(host, plan, new Set(), leaving)
  return leaving.length === 0 ? null : leaving
}
