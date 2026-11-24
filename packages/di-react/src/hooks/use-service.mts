import { useCallback, useEffect, useReducer, useRef, useState } from 'react'

import type {
  AnyInjectableType,
  BoundInjectionToken,
  ClassType,
  Factorable,
  FactoryInjectionToken,
  InferInput,
  InjectionToken,
  InjectionTokenSchemaType,
  MissingArgsError,
} from '@navios/di'
import { useContainer } from './use-container.mjs'

type ServiceState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error }

type ServiceAction<T> =
  | { type: 'loading' }
  | { type: 'success'; data: T }
  | { type: 'error'; error: Error }
  | { type: 'reset' }

function serviceReducer<T>(state: ServiceState<T>, action: ServiceAction<T>): ServiceState<T> {
  switch (action.type) {
    case 'loading':
      return { status: 'loading' }
    case 'success':
      return { status: 'success', data: action.data }
    case 'error':
      return { status: 'error', error: action.error }
    case 'reset':
      return { status: 'idle' }
    default:
      return state
  }
}

export interface UseServiceResult<T> {
  data: T | undefined
  error: Error | undefined
  isLoading: boolean
  isSuccess: boolean
  isError: boolean
  refetch: () => void
}

// #1 Simple class
export function useService<T extends ClassType>(
  token: T,
): UseServiceResult<InstanceType<T> extends Factorable<infer R> ? R : InstanceType<T>>

// #2 Token with required Schema
export function useService<T, S extends InjectionTokenSchemaType>(
  token: InjectionToken<T, S>,
  args: InferInput<S>,
): UseServiceResult<T>

// #3 Token with optional Schema
export function useService<T, S extends InjectionTokenSchemaType, R extends boolean>(
  token: InjectionToken<T, S, R>,
): R extends false
  ? UseServiceResult<T>
  : MissingArgsError<S>

// #4 Token with no Schema
export function useService<T>(token: InjectionToken<T, undefined>): UseServiceResult<T>

export function useService<T>(token: BoundInjectionToken<T, any>): UseServiceResult<T>

export function useService<T>(token: FactoryInjectionToken<T, any>): UseServiceResult<T>

export function useService(
  token:
    | ClassType
    | InjectionToken<any, any>
    | BoundInjectionToken<any, any>
    | FactoryInjectionToken<any, any>,
  args?: unknown,
): UseServiceResult<any> {
  // useContainer returns ScopedContainer if inside ScopeProvider, otherwise Container
  // This automatically handles request-scoped services correctly
  const container = useContainer()

  // Try to get the instance synchronously first for better performance
  // This avoids the async loading state when the instance is already cached
  // We use a ref to track this so it doesn't cause effect re-runs
  const initialSyncInstanceRef = useRef<any>(null)
  const isFirstRenderRef = useRef(true)

  if (isFirstRenderRef.current) {
    initialSyncInstanceRef.current = container.tryGetSync(token, args)
    isFirstRenderRef.current = false
  }

  const hasInitialSyncInstance = initialSyncInstanceRef.current !== null
  const initialState: ServiceState<any> = hasInitialSyncInstance
    ? { status: 'success', data: initialSyncInstanceRef.current }
    : { status: 'idle' }

  const [state, dispatch] = useReducer(serviceReducer, initialState)
  const [refetchCounter, setRefetchCounter] = useState(0)

  if (process.env.NODE_ENV === 'development') {
    const argsRef = useRef<unknown>(args)
    useEffect(() => {
      if (argsRef.current !== args) {
        if (JSON.stringify(argsRef.current) === JSON.stringify(args)) {
          console.warn(`useService called with args that look the same but are different instances: ${JSON.stringify(argsRef.current)} !== ${JSON.stringify(args)}!
This is likely because you are using a value that is not memoized.
Please use a memoized value or use a different approach to pass the args.
Example:
  const args = useMemo(() => ({ userId: '123' }), [])
  return useService(UserToken, args)`)
        }
        argsRef.current = args
      }
    }, [args])
  }

  // Subscribe to invalidation events
  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    let isMounted = true

    // The container routes the listener to the store that owns the instance
    // (the root store for singletons, the scope's store for request-scoped).
    const subscribe = () => {
      if (unsubscribe) return
      unsubscribe = container.onInvalidate(token, args, () => {
        // Re-fetch when the service is invalidated
        if (isMounted) {
          dispatch({ type: 'loading' })
          void fetchAndSubscribe()
        }
      })
    }

    // Fetch the service and set up subscription
    const fetchAndSubscribe = async () => {
      try {
        // The container (either ScopedContainer or Container) handles resolution correctly
        const instance = await container.get(
          // @ts-expect-error - token is valid
          token as AnyInjectableType,
          args as any,
        )

        if (!isMounted) return

        dispatch({ type: 'success', data: instance })

        // Set up subscription after we have the instance
        subscribe()
      } catch (error) {
        if (isMounted) {
          dispatch({ type: 'error', error: error as Error })
        }
      }
    }

    // If we already have a sync instance from initial render, just set up subscription
    // Otherwise, fetch async
    if (initialSyncInstanceRef.current !== null && refetchCounter === 0) {
      subscribe()
    } else {
      dispatch({ type: 'loading' })
      void fetchAndSubscribe()
    }

    return () => {
      isMounted = false
      unsubscribe?.()
    }
  }, [container, token, args, refetchCounter])

  const refetch = useCallback(() => {
    setRefetchCounter((c) => c + 1)
  }, [])

  return {
    data: state.status === 'success' ? state.data : undefined,
    error: state.status === 'error' ? state.error : undefined,
    isLoading: state.status === 'loading',
    isSuccess: state.status === 'success',
    isError: state.status === 'error',
    refetch,
  }
}
