import type {
  BoundInjectionToken,
  ClassType,
  Container,
  Factorable,
  FactoryInjectionToken,
  InjectionToken,
  InjectionTokenSchemaType,
} from '@navios/di'
import type { z, ZodType } from 'zod/v4'

import { InjectableScope, ScopedContainer } from '@navios/di'

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'

import type { Join, UnionToArray } from '../types.mjs'

import { useContainer, useRootContainer } from './use-container.mjs'

// Cache entry for suspense
interface CacheEntry<T> {
  promise: Promise<T> | null
  result: T | undefined
  error: Error | undefined
  status: 'pending' | 'resolved' | 'rejected'
  version: number // Increment on each fetch to track changes
  subscribers: Set<() => void>
  instanceName: string | null
  unsubscribe: (() => void) | undefined
}

// Global cache for service instances (per container + token + args combination)
const cacheMap = new WeakMap<object, Map<string, CacheEntry<any>>>()

function getCacheKey(token: any, args: unknown): string {
  const tokenId =
    typeof token === 'function'
      ? token.name
      : token.id || token.token?.id || String(token)
  return `${tokenId}:${JSON.stringify(args ?? null)}`
}

function getCache(container: object): Map<string, CacheEntry<any>> {
  let cache = cacheMap.get(container)
  if (!cache) {
    cache = new Map()
    cacheMap.set(container, cache)
  }
  return cache
}

/**
 * Sets up invalidation subscription for a cache entry if not already subscribed.
 * When the service is destroyed, clears the cache and notifies subscribers.
 */
function setupInvalidationSubscription(
  entry: CacheEntry<any>,
  rootContainer: Container,
): void {
  if (entry.unsubscribe || !entry.instanceName) return

  const eventBus = rootContainer.getEventBus()
  entry.unsubscribe = eventBus.on(entry.instanceName, 'destroy', () => {
    // Clear cache and notify subscribers to re-fetch
    entry.result = undefined
    entry.error = undefined
    entry.status = 'pending'
    entry.promise = null
    // Notify all subscribers
    entry.subscribers.forEach((callback) => callback())
  })
}

// #1 Simple class
export function useSuspenseService<T extends ClassType>(
  token: T,
): InstanceType<T> extends Factorable<infer R> ? R : InstanceType<T>

// #2 Token with required Schema
export function useSuspenseService<T, S extends InjectionTokenSchemaType>(
  token: InjectionToken<T, S>,
  args: z.input<S>,
): T

// #3 Token with optional Schema
export function useSuspenseService<
  T,
  S extends InjectionTokenSchemaType,
  R extends boolean,
>(
  token: InjectionToken<T, S, R>,
): R extends false
  ? T
  : S extends ZodType<infer Type>
    ? `Error: Your token requires args: ${Join<UnionToArray<keyof Type>, ', '>}`
    : 'Error: Your token requires args'

// #4 Token with no Schema
export function useSuspenseService<T>(token: InjectionToken<T, undefined>): T

export function useSuspenseService<T>(token: BoundInjectionToken<T, any>): T

export function useSuspenseService<T>(token: FactoryInjectionToken<T, any>): T

export function useSuspenseService(
  token:
    | ClassType
    | InjectionToken<any, any>
    | BoundInjectionToken<any, any>
    | FactoryInjectionToken<any, any>,
  args?: unknown,
): any {
  // useContainer returns ScopedContainer if inside ScopeProvider, otherwise Container
  const container = useContainer()
  const rootContainer = useRootContainer()
  const cache = getCache(container)
  const cacheKey = getCacheKey(token, args)
  const entryRef = useRef<CacheEntry<any> | null>(null)
  if (process.env.NODE_ENV === 'development') {
    const argsRef = useRef<unknown>(args)
    useEffect(() => {
      if (argsRef.current !== args) {
        if (JSON.stringify(argsRef.current) === JSON.stringify(args)) {
          console.log(`WARNING: useService called with args that look the same but are different instances: ${JSON.stringify(argsRef.current)} !== ${JSON.stringify(args)}!
          This is likely because you are using not memoized value that is not stable.
          Please use a memoized value or use a different approach to pass the args.
          Example:
          const args = useMemo(() => ({ userId: '123' }), [])
          return useService(UserToken, args)
          `)
        }
        argsRef.current = args
      }
    }, [args])
  }

  // Initialize or get cache entry
  if (!cache.has(cacheKey)) {
    // Try to get the instance synchronously first for better performance
    // This avoids suspense when the instance is already cached
    const syncInstance = container.tryGetSync(token, args)

    const realToken = rootContainer
      .getTokenResolver()
      .getRealToken(rootContainer.getTokenResolver().normalizeToken(token))
    const scope = rootContainer.getRegistry().get(realToken).scope
    const instanceName = rootContainer
      .getNameResolver()
      .generateInstanceName(
        realToken,
        args,
        scope === InjectableScope.Request
          ? ((container as ScopedContainer).getRequestId() ?? undefined)
          : undefined,
        scope,
      )
    const entry: CacheEntry<any> = {
      promise: null,
      result: syncInstance ?? undefined,
      error: undefined,
      status: syncInstance ? 'resolved' : 'pending',
      version: 0,
      subscribers: new Set(),
      instanceName,
      unsubscribe: undefined,
    }
    cache.set(cacheKey, entry)
  }

  const entry = cache.get(cacheKey)!
  entryRef.current = entry

  // Function to fetch the service
  const fetchService = useCallback(() => {
    const currentEntry = entryRef.current
    if (!currentEntry) return

    currentEntry.status = 'pending'
    currentEntry.version++ // Increment version to signal change to useSyncExternalStore
    currentEntry.promise = (container.get as any)(token, args)
      .then((instance: any) => {
        currentEntry.result = instance
        currentEntry.status = 'resolved'

        // Subscribe to invalidation events if not already subscribed
        setupInvalidationSubscription(currentEntry, rootContainer)

        // Notify subscribers
        currentEntry.subscribers.forEach((callback) => callback())
        return instance
      })
      .catch((error: Error) => {
        currentEntry.error = error
        currentEntry.status = 'rejected'
        throw error
      })

    return currentEntry.promise
  }, [container, rootContainer, token, args])

  // Subscribe to cache changes
  const subscribe = useCallback(
    (callback: () => void) => {
      entry.subscribers.add(callback)
      return () => {
        entry.subscribers.delete(callback)
      }
    },
    [entry],
  )

  // Get snapshot of current state - include version to detect invalidation
  const getSnapshot = useCallback(() => {
    return `${entry.status}:${entry.version}`
  }, [entry])

  // Use sync external store to track cache state
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  // Set up subscription for sync instances that don't have one yet
  useEffect(() => {
    const currentEntry = entryRef.current
    if (
      currentEntry &&
      currentEntry.status === 'resolved' &&
      currentEntry.instanceName &&
      !currentEntry.unsubscribe
    ) {
      setupInvalidationSubscription(currentEntry, rootContainer)
    }
  }, [rootContainer, entry])

  // Start fetching if not already
  if (entry.status === 'pending' && !entry.promise) {
    fetchService()
  }

  // Suspense behavior
  if (entry.status === 'pending') {
    throw entry.promise
  }

  if (entry.status === 'rejected') {
    throw entry.error
  }

  return entry.result
}
