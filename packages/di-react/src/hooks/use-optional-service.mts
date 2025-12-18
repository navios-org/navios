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

import { useCallback, useEffect, useReducer, useRef } from 'react'

import type { Join, UnionToArray } from '../types.mjs'

import { useContainer, useRootContainer } from './use-container.mjs'

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
): UseOptionalServiceResult<
  InstanceType<T> extends Factorable<infer R> ? R : InstanceType<T>
>

// #2 Token with required Schema
export function useOptionalService<T, S extends InjectionTokenSchemaType>(
  token: InjectionToken<T, S>,
  args: z.input<S>,
): UseOptionalServiceResult<T>

// #3 Token with optional Schema
export function useOptionalService<
  T,
  S extends InjectionTokenSchemaType,
  R extends boolean,
>(
  token: InjectionToken<T, S, R>,
): R extends false
  ? UseOptionalServiceResult<T>
  : S extends ZodType<infer Type>
    ? `Error: Your token requires args: ${Join<UnionToArray<keyof Type>, ', '>}`
    : 'Error: Your token requires args'

// #4 Token with no Schema
export function useOptionalService<T>(
  token: InjectionToken<T, undefined>,
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
  const rootContainer = useRootContainer()
  const serviceLocator = rootContainer.getServiceLocator()

  // Try to get the instance synchronously first for better performance
  // This avoids the async loading state when the instance is already cached
  // We use a ref to track this so it doesn't cause effect re-runs
  const initialSyncInstanceRef = useRef<any>(undefined)
  const isFirstRenderRef = useRef(true)

  if (isFirstRenderRef.current) {
    try {
      initialSyncInstanceRef.current = container.tryGetSync(token, args)
    } catch {
      // Service not registered, leave as undefined
    }
    isFirstRenderRef.current = false
  }

  const initialState: OptionalServiceState<any> = initialSyncInstanceRef.current
    ? { status: 'success', data: initialSyncInstanceRef.current }
    : { status: 'idle' }

  const [state, dispatch] = useReducer(optionalServiceReducer, initialState)
  const instanceNameRef = useRef<string | null>(null)

  if (process.env.NODE_ENV === 'development') {
    const argsRef = useRef<unknown>(args)
    useEffect(() => {
      if (argsRef.current !== args) {
        if (JSON.stringify(argsRef.current) === JSON.stringify(args)) {
          console.log(`WARNING: useOptionalService called with args that look the same but are different instances: ${JSON.stringify(argsRef.current)} !== ${JSON.stringify(args)}!
          This is likely because you are using not memoized value that is not stable.
          Please use a memoized value or use a different approach to pass the args.
          Example:
          const args = useMemo(() => ({ userId: '123' }), [])
          return useOptionalService(UserToken, args)
          `)
        }
        argsRef.current = args
      }
    }, [args])
  }

  const fetchService = useCallback(async () => {
    dispatch({ type: 'loading' })
    try {
      // Use the container (ScopedContainer or Container) for resolution
      const instance = await container.get(
        // @ts-expect-error - token is valid
        token as AnyInjectableType,
        args as any,
      )

      // Get instance name for event subscription
      instanceNameRef.current = serviceLocator.getInstanceIdentifier(
        token as AnyInjectableType,
        args,
      )
      dispatch({ type: 'success', data: instance })
    } catch (error) {
      // Caught exceptions are treated as errors
      const err = error as Error
      const errorMessage = err.message?.toLowerCase() ?? ''
      if (
        errorMessage.includes('not found') ||
        errorMessage.includes('not registered') ||
        errorMessage.includes('no provider')
      ) {
        dispatch({ type: 'not-found' })
      } else {
        dispatch({ type: 'error', error: err })
      }
    }
  }, [container, serviceLocator, token, args])

  // Subscribe to invalidation events
  useEffect(() => {
    const eventBus = serviceLocator.getEventBus()
    let unsubscribe: (() => void) | undefined

    // If we already have a sync instance from initial render, just set up subscription
    // Otherwise, fetch async
    const syncInstance = initialSyncInstanceRef.current
    if (syncInstance) {
      instanceNameRef.current = serviceLocator.getInstanceIdentifier(
        token as AnyInjectableType,
        args,
      )
      unsubscribe = eventBus.on(instanceNameRef.current, 'destroy', () => {
        void fetchService()
      })
    } else {
      void fetchService()

      // Set up subscription after we have the instance name
      const setupSubscription = () => {
        if (instanceNameRef.current) {
          unsubscribe = eventBus.on(instanceNameRef.current, 'destroy', () => {
            // Re-fetch when the service is invalidated
            void fetchService()
          })
        }
      }

      // Wait a tick for the instance name to be set
      const timeoutId = setTimeout(setupSubscription, 10)

      return () => {
        clearTimeout(timeoutId)
        unsubscribe?.()
      }
    }

    return () => {
      unsubscribe?.()
    }
  }, [fetchService, serviceLocator, token, args])

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
