import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'

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
export function useService<T extends ClassType>(token: T): UseServiceResult<ResolvedInstance<T>>

// #2 Token with required Schema
export function useService<T, S extends StandardSchemaV1>(
  token: InjectionToken<T, S>,
  args: InferInput<S>,
): UseServiceResult<T>

// #3 Token with optional Schema
export function useService<T, S extends StandardSchemaV1, R extends boolean>(
  token: InjectionToken<T, S, R>,
): R extends false ? UseServiceResult<T> : MissingArgsError<S>

// #4 Token with no Schema
export function useService<T>(token: InjectionToken<T, unknown>): UseServiceResult<T>

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
    const instance = container.peek(token as InjectionToken<any, any>, args)
    initialSyncRef.current = instance === null ? null : { container, token, argsKey, instance }
  }

  const initialState: ServiceState<any> =
    initialSyncRef.current !== null
      ? { status: 'success', data: initialSyncRef.current.instance }
      : { status: 'idle' }

  const [state, dispatch] = useReducer(serviceReducer, initialState)
  const [refetchCounter, setRefetchCounter] = useState(0)

  // Subscribe to invalidation events
  useEffect(() => {
    let unsubscribe: (() => void) | undefined
    let isMounted = true

    // The container routes the listener to the store that owns the instance
    // (the root store for singletons, the scope's store for request-scoped).
    const subscribe = () => {
      if (unsubscribe) return
      unsubscribe = container.onInvalidate(token, stableArgs, () => {
        // Re-fetch when the service is invalidated
        if (!isMounted) return
        dispatch({ type: 'loading' })
        // Listeners run once the invalidation has finished, so resolving here
        // builds the service once. The microtask only keeps the resolution out
        // of the container's notification loop.
        queueMicrotask(() => {
          if (isMounted) {
            void fetchAndSubscribe()
          }
        })
      })
    }

    // Fetch the service and set up subscription
    const fetchAndSubscribe = async () => {
      try {
        // The container (either ScopedContainer or Container) handles resolution correctly
        const instance = await container.get(
          // @ts-expect-error - token is valid
          token as AnyInjectableType,
          stableArgs as any,
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

    // If the instance read during the first render is still the one asked
    // for, just set up the subscription. Otherwise, fetch async.
    const initial = initialSyncRef.current
    if (
      initial != null &&
      initial.container === container &&
      initial.token === token &&
      initial.argsKey === argsKey &&
      refetchCounter === 0
    ) {
      subscribe()
    } else {
      initialSyncRef.current = null
      dispatch({ type: 'loading' })
      void fetchAndSubscribe()
    }

    return () => {
      isMounted = false
      unsubscribe?.()
    }
  }, [container, token, stableArgs, argsKey, refetchCounter])

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
