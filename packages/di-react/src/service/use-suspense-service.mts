import { useCallback, useSyncExternalStore } from 'react'

import type { Container, InjectionToken, ScopedContainer } from '@navios/di'

import { useContainer } from '../container/use-container.mjs'

import { getArgsKey } from './args-key.mjs'

import type { AnyServiceToken, ServiceHook } from './types.mjs'

// Cache entry for suspense
interface CacheEntry<T> {
  promise: Promise<T> | null
  result: T | undefined
  error: Error | undefined
  status: 'pending' | 'resolved' | 'rejected'
  version: number // Increment on each fetch to track changes
  subscribers: Set<() => void>
  unsubscribe: (() => void) | undefined
  // The timer after which a rejected entry leaves the cache
  eviction: ReturnType<typeof setTimeout> | undefined
  // The timer after which an entry no component shows leaves the cache
  release: ReturnType<typeof setTimeout> | undefined
  // How many renders read the entry
  renders: number
}

type AnyContainer = Container | ScopedContainer
type Cache = Map<string, CacheEntry<any>>

// Global cache for service instances: container -> token object -> args key.
// Tokens have no ids, so the token object itself (class, token, or the
// Bound/Factory wrapper) is the identity.
const cacheMap = new WeakMap<object, WeakMap<object, Cache>>()

function getCache(container: object, token: object): Cache {
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
 * The cache entry for `key`, created on first use. An instance the container
 * already holds makes it resolved, so the first render does not suspend. The
 * entry listens for the invalidation of that instance from the start: an
 * effect would subscribe after the render, and miss one in between.
 */
function getEntry(
  cache: Cache,
  key: string,
  container: AnyContainer,
  token: AnyServiceToken,
  args: unknown,
): CacheEntry<any> {
  let entry = cache.get(key)
  if (!entry) {
    const syncInstance = container.peek(token as InjectionToken<any, any>, args)
    entry = {
      promise: null,
      result: syncInstance !== null ? syncInstance : undefined,
      error: undefined,
      status: syncInstance !== null ? 'resolved' : 'pending',
      version: 0,
      subscribers: new Set(),
      unsubscribe: undefined,
      eviction: undefined,
      release: undefined,
      renders: 0,
    }
    cache.set(key, entry)
    if (syncInstance !== null) {
      setupInvalidationSubscription(entry, container, token, args)
    }
  }
  return entry
}

/**
 * Sets up invalidation subscription for a cache entry if not already subscribed.
 * When the service is destroyed, clears the cache and notifies subscribers.
 */
function setupInvalidationSubscription(
  entry: CacheEntry<any>,
  container: AnyContainer,
  token: AnyServiceToken,
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

function fetchService(
  entry: CacheEntry<any>,
  container: AnyContainer,
  token: AnyServiceToken,
  args: unknown,
): void {
  entry.status = 'pending'
  entry.version++ // Increment version to signal change to useSyncExternalStore
  entry.promise = (container.get as any)(token, args)
    .then((instance: unknown) => {
      entry.result = instance
      entry.status = 'resolved'

      // Subscribe to invalidation events if not already subscribed
      setupInvalidationSubscription(entry, container, token, args)

      // Notify subscribers
      entry.subscribers.forEach((callback) => callback())
      return instance
    })
    .catch((error: Error) => {
      entry.error = error
      entry.status = 'rejected'
      throw error
    })
}

/**
 * Drops a rejected entry two timer turns after the last render that threw its
 * error. Every render until then throws the error again: React renders a
 * failed component a second time before it shows the error boundary, and when
 * the first of those renders used up its time slice, the second one runs in a
 * later task. That task is queued before the second timer is, so it still
 * finds the entry; with one turn it found the cache empty and resolved the
 * service again. The next render after that, such as the one of an error
 * boundary reset, resolves the service again.
 */
function evictAfterRender(cache: Cache, key: string, entry: CacheEntry<any>): void {
  clearTimeout(entry.eviction)
  entry.eviction = setTimeout(() => {
    entry.eviction = setTimeout(() => {
      if (cache.get(key) === entry && entry.status === 'rejected') {
        cache.delete(key)
        entry.unsubscribe?.()
      }
    }, 0)
  }, 0)
}

/**
 * Drops a resolved entry, and its invalidation listener, one timer turn after
 * its last subscriber left, unless a component subscribed or rendered with it
 * in the meantime. A component that shows the service later reads the instance
 * from the container again.
 */
function releaseWhenUnused(cache: Cache, key: string, entry: CacheEntry<any>): void {
  clearTimeout(entry.release)
  const renders = entry.renders
  entry.release = setTimeout(() => {
    if (
      cache.get(key) === entry &&
      entry.status === 'resolved' &&
      entry.subscribers.size === 0 &&
      entry.renders === renders
    ) {
      cache.delete(key)
      entry.unsubscribe?.()
      entry.unsubscribe = undefined
    }
  }, 0)
}

/**
 * Hook that returns a service from the DI container and suspends while it is
 * resolved. A failed resolution is thrown to the nearest error boundary.
 * Resolves again, suspending, when the instance is invalidated.
 */
export const useSuspenseService = function useSuspenseService(
  token: AnyServiceToken,
  args?: unknown,
): any {
  // useContainer returns ScopedContainer if inside ScopeProvider, otherwise Container
  const container = useContainer()
  const cache = getCache(container, token)
  const cacheKey = getArgsKey(args)
  const entry = getEntry(cache, cacheKey, container, token, args)
  entry.renders++

  // Subscribe to cache changes
  const subscribe = useCallback(
    (callback: () => void) => {
      entry.subscribers.add(callback)
      return () => {
        entry.subscribers.delete(callback)
        if (entry.subscribers.size === 0) {
          releaseWhenUnused(cache, cacheKey, entry)
        }
      }
    },
    [cache, cacheKey, entry],
  )

  // Get snapshot of current state - include version to detect invalidation
  const getSnapshot = useCallback(() => {
    return `${entry.status}:${entry.version}`
  }, [entry])

  // Use sync external store to track cache state
  useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  // Start fetching if not already
  if (entry.status === 'pending' && !entry.promise) {
    fetchService(entry, container, token, args)
  }

  // Suspense behavior
  if (entry.status === 'pending') {
    throw entry.promise
  }

  if (entry.status === 'rejected') {
    // A later render tries again
    evictAfterRender(cache, cacheKey, entry)
    throw entry.error
  }

  return entry.result
} as ServiceHook<'suspense'>
