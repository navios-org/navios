import { DIError, DIErrorCode } from '@navios/di'
import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'

import type {
  AnyInjectableType,
  BoundInjectionToken,
  ClassType,
  FactoryInjectionToken,
  InferInput,
  InjectionToken,
  MissingArgsError,
  ResolvedInstance,
  StandardSchemaV1,
} from '@navios/di'

import { useContainer } from '../container/use-container.mjs'

import { getArgsKey } from './args-key.mjs'

import type { InitialSync } from './initial-sync.mjs'

type OptionalServiceState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'not-found' }
  | { status: 'error'; error: Error }

type OptionalServiceAction<T> =
  | { type: 'loading' }
  | { type: 'success'; data: T }
  | { type: 'not-found' }
  | { type: 'error'; error: Error }
  | { type: 'reset' }

function optionalServiceReducer<T>(
  state: OptionalServiceState<T>,
  action: OptionalServiceAction<T>,
): OptionalServiceState<T> {
  switch (action.type) {
    case 'loading':
      return { status: 'loading' }
    case 'success':
      return { status: 'success', data: action.data }
    case 'not-found':
      return { status: 'not-found' }
    case 'error':
      return { status: 'error', error: action.error }
    case 'reset':
      return { status: 'idle' }
    default:
      return state
  }
}

export interface UseOptionalServiceResult<T> {
  /**
   * The service instance if found and loaded successfully, otherwise undefined.
   */
  data: T | undefined
  /**
   * Error that occurred during loading (excludes "not found" which is not an error).
   */
  error: Error | undefined
  /**
   * True while the service is being loaded.
   */
  isLoading: boolean
  /**
   * True if the service was loaded successfully.
   */
  isSuccess: boolean
  /**
   * True if the service was not found (not registered in the container).
   */
  isNotFound: boolean
  /**
   * True if an error occurred during loading.
   */
  isError: boolean
  /**
   * Function to manually re-fetch the service.
   */
  refetch: () => void
}

// #1 Simple class
export function useOptionalService<T extends ClassType>(
  token: T,
): UseOptionalServiceResult<ResolvedInstance<T>>

// #2 Token with required Schema
export function useOptionalService<T, S extends StandardSchemaV1>(
  token: InjectionToken<T, S>,
  args: InferInput<S>,
): UseOptionalServiceResult<T>

// #3 Token with optional Schema
export function useOptionalService<T, S extends StandardSchemaV1, R extends boolean>(
  token: InjectionToken<T, S, R>,
): R extends false ? UseOptionalServiceResult<T> : MissingArgsError<S>

// #4 Token with no Schema
export function useOptionalService<T>(
  token: InjectionToken<T, unknown>,
): UseOptionalServiceResult<T>

export function useOptionalService<T>(
  token: BoundInjectionToken<T, any>,
): UseOptionalServiceResult<T>

export function useOptionalService<T>(
  token: FactoryInjectionToken<T, any>,
): UseOptionalServiceResult<T>

/**
 * Hook to optionally load a service from the DI container.
 *
 * Unlike useService, this hook does NOT throw an error if the service is not registered.
 * Instead, it returns `isNotFound: true` when the service doesn't exist.
 *
 * This is useful for:
 * - Optional dependencies that may or may not be configured
 * - Feature flags where a service might not be available
 * - Plugins or extensions that are conditionally registered
 *
 * @example
 * ```tsx
 * function Analytics() {
 *   const { data: analytics, isNotFound } = useOptionalService(AnalyticsService)
 *
 *   if (isNotFound) {
 *     // Analytics service not configured, skip tracking
 *     return null
 *   }
 *
 *   return <AnalyticsTracker service={analytics} />
 * }
 * ```
 */
export function useOptionalService(
  token:
    | ClassType
    | InjectionToken<any, any>
    | BoundInjectionToken<any, any>
    | FactoryInjectionToken<any, any>,
  args?: unknown,
): UseOptionalServiceResult<any> {
  // useContainer returns ScopedContainer if inside ScopeProvider, otherwise Container
  const container = useContainer()

  // Args that serialize the same are the same args: an object literal in the
  // call must not restart the hook on every render.
  const argsKey = getArgsKey(args)
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  const stableArgs = useMemo(() => args, [argsKey])

  // Try to get the instance synchronously first for better performance
  // This avoids the async loading state when the instance is already cached
  // The ref remembers what it was read for, so the shortcut is only taken for
  // that container, token and args.
  const initialSyncRef = useRef<InitialSync | null | undefined>(undefined)

  if (initialSyncRef.current === undefined) {
    let instance: unknown = null
    try {
      instance = container.peek(token as InjectionToken<any, any>, args)
    } catch {
      // Service not registered, leave as null
    }
    initialSyncRef.current = instance === null ? null : { container, token, argsKey, instance }
  }

  const initialState: OptionalServiceState<any> =
    initialSyncRef.current !== null
      ? { status: 'success', data: initialSyncRef.current.instance }
      : { status: 'idle' }

  const [state, dispatch] = useReducer(optionalServiceReducer, initialState)

  // Resolves to true when the service was loaded
  const fetchService = useCallback(async (): Promise<boolean> => {
    dispatch({ type: 'loading' })
    try {
      // Use the container (ScopedContainer or Container) for resolution
      const instance = await container.get(
        // @ts-expect-error - token is valid
        token as AnyInjectableType,
        stableArgs as any,
      )
      dispatch({ type: 'success', data: instance })
      return true
    } catch (error) {
      if (
        error instanceof DIError &&
        error.code === DIErrorCode.ProviderNotFound &&
        // It may be something the service depends on.
        !container.isRegistered(token)
      ) {
        dispatch({ type: 'not-found' })
      } else {
        dispatch({ type: 'error', error: error as Error })
      }
      return false
    }
  }, [container, token, stableArgs])

  // Subscribe to invalidation events
  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    let isMounted = true

    const subscribe = () => {
      if (unsubscribe || !isMounted) return
      unsubscribe = container.onInvalidate(token, stableArgs, () => {
        // Re-fetch when the service is invalidated
        dispatch({ type: 'loading' })
        // Listeners run once the invalidation has finished, so resolving here
        // builds the service once. The microtask only keeps the resolution out
        // of the container's notification loop.
        queueMicrotask(() => {
          if (isMounted) {
            void fetchService()
          }
        })
      })
    }

    // If the instance read during the first render is still the one asked
    // for, just set up the subscription. Otherwise, fetch async.
    const initial = initialSyncRef.current
    if (
      initial != null &&
      initial.container === container &&
      initial.token === token &&
      initial.argsKey === argsKey
    ) {
      subscribe()
    } else {
      initialSyncRef.current = null
      void fetchService().then((loaded) => {
        if (loaded) {
          subscribe()
        }
      })
    }

    return () => {
      isMounted = false
      unsubscribe?.()
    }
  }, [fetchService, container, token, stableArgs, argsKey])

  return {
    data: state.status === 'success' ? state.data : undefined,
    error: state.status === 'error' ? state.error : undefined,
    isLoading: state.status === 'loading',
    isSuccess: state.status === 'success',
    isNotFound: state.status === 'not-found',
    isError: state.status === 'error',
    refetch: fetchService,
  }
}
