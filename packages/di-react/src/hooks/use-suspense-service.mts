import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'

import type {
  BoundInjectionToken,
  ClassType,
  Container,
  Factorable,
  FactoryInjectionToken,
  InferInput,
  InjectionToken,
  InjectionTokenSchemaType,
  MissingArgsError,
  ScopedContainer,
} from '@navios/di'

import { useContainer } from './use-container.mjs'

// Cache entry for suspense
interface CacheEntry<T> {
  promise: Promise<T> | null
  result: T | undefined
  error: Error | undefined
  status: 'pending' | 'resolved' | 'rejected'
  version: number // Increment on each fetch to track changes
  subscribers: Set<() => void>
  unsubscribe: (() => void) | undefined
}

type AnyContainer = Container | ScopedContainer
type AnyToken =
  | ClassType
  | InjectionToken<any, any>
  | BoundInjectionToken<any, any>
  | FactoryInjectionToken<any, any>

// Global cache for service instances: container -> token object -> args key.
// Tokens have no ids, so the token object itself (class, token, or the
// Bound/Factory wrapper) is the identity.
const cacheMap = new WeakMap<object, WeakMap<object, Map<string, CacheEntry<any>>>>()

function getArgsKey(args: unknown): string {
  return JSON.stringify(args) ?? ''
}

function getCache(container: object, token: object): Map<string, CacheEntry<any>> {
  let byToken = cacheMap.get(container)
  if (!byToken) {
    byToken = new WeakMap()
    cacheMap.set(container, byToken)
  }
  let cache = byToken.get(token)
  if (!cache) {
    cache = new Map()
    byToken.set(token, cache)
  }
  return cache
}

/**
 * Sets up invalidation subscription for a cache entry if not already subscribed.
 * When the service is destroyed, clears the cache and notifies subscribers.
 */
function setupInvalidationSubscription(
  entry: CacheEntry<any>,
  container: AnyContainer,
  token: AnyToken,
  args: unknown,
): void {
  if (entry.unsubscribe) return

  entry.unsubscribe = container.onInvalidate(token, args, () => {
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
  args: InferInput<S>,
): T

// #3 Token with optional Schema
export function useSuspenseService<T, S extends InjectionTokenSchemaType, R extends boolean>(
  token: InjectionToken<T, S, R>,
): R extends false ? T : MissingArgsError<S>

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
  const cache = getCache(container, token)
  const cacheKey = getArgsKey(args)
  const entryRef = useRef<CacheEntry<any> | null>(null)
  if (process.env.NODE_ENV === 'development') {
    const argsRef = useRef<unknown>(args)
    useEffect(() => {
      if (argsRef.current !== args) {
        if (JSON.stringify(argsRef.current) === JSON.stringify(args)) {
          console.warn(`useSuspenseService called with args that look the same but are different instances: ${JSON.stringify(argsRef.current)} !== ${JSON.stringify(args)}!
This is likely because you are using a value that is not memoized.
Please use a memoized value or use a different approach to pass the args.
Example:
  const args = useMemo(() => ({ userId: '123' }), [])
  return useSuspenseService(UserToken, args)`)
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

    const entry: CacheEntry<any> = {
      promise: null,
      result: syncInstance !== null ? syncInstance : undefined,
      error: undefined,
      status: syncInstance !== null ? 'resolved' : 'pending',
      version: 0,
      subscribers: new Set(),
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
        setupInvalidationSubscription(currentEntry, container, token, args)

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
  }, [container, token, args])

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
    if (currentEntry && currentEntry.status === 'resolved' && !currentEntry.unsubscribe) {
      setupInvalidationSubscription(currentEntry, container, token, args)
    }
  }, [container, token, args, entry])

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
