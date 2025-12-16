import type {
  AnyInjectableType,
  BoundInjectionToken,
  ClassType,
  Factorable,
  FactoryInjectionToken,
  InjectionToken,
  InjectionTokenSchemaType,
} from '@navios/di'
import type { z, ZodType } from 'zod/v4'

import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'

import type { Join, UnionToArray } from '../types.mjs'

import { useContainer } from './use-container.mjs'

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
  const container = useContainer()
  const serviceLocator = container.getServiceLocator()
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
    const entry: CacheEntry<any> = {
      promise: null,
      result: undefined,
      error: undefined,
      status: 'pending',
      version: 0,
      subscribers: new Set(),
      instanceName: null,
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
        currentEntry.instanceName = serviceLocator.getInstanceIdentifier(
          token as AnyInjectableType,
          args,
        )

        // Subscribe to invalidation events if not already subscribed
        if (!currentEntry.unsubscribe && currentEntry.instanceName) {
          const eventBus = serviceLocator.getEventBus()
          currentEntry.unsubscribe = eventBus.on(
            currentEntry.instanceName,
            'destroy',
            () => {
              // Clear cache and notify subscribers to re-fetch
              currentEntry.result = undefined
              currentEntry.error = undefined
              currentEntry.status = 'pending'
              currentEntry.promise = null
              // Notify all subscribers
              currentEntry.subscribers.forEach((callback) => callback())
            },
          )
        }

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
  }, [container, serviceLocator, token, args])

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

  // Cleanup subscription on unmount
  useEffect(() => {
    return () => {
      // // If there are no subscribers, unsubscribe and delete the cache entry
      // if (entry.subscribers.size === 0) {
      //   entry.unsubscribe?.()
      //   cache.delete(cacheKey)
      // }
    }
  }, [])

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
