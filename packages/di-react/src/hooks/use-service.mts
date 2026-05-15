import { useCallback, useEffect, useReducer, useRef, useState } from 'react'

import type {
  AnyInjectableType,
  BoundToken,
  ClassType,
  Factorable,
  FactoryToken,
  Token,
  TokenSchemaType,
} from '@navios/di'
import type { z, ZodType } from 'zod/v4'

import type { Join, UnionToArray } from '../types.mjs'

import { useContainer, useRootContainer } from './use-container.mjs'

type ServiceState<T> =
  | { status: 'loading'; data: undefined }
  | { status: 'success'; data: T }
  | { status: 'error'; error: Error }

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
export function useService<T, S extends TokenSchemaType>(
  token: Token<T, S>,
  args: z.input<S>,
): UseServiceResult<T>

// #3 Token with optional Schema
export function useService<T, S extends TokenSchemaType, R extends boolean>(
  token: Token<T, S, R>,
): R extends false
  ? UseServiceResult<T>
  : S extends ZodType<infer Type>
    ? `Error: Your token requires args: ${Join<UnionToArray<keyof Type>, ', '>}`
    : 'Error: Your token requires args'

// #4 Token with no Schema
export function useService<T>(token: Token<T, undefined>): UseServiceResult<T>

export function useService<T>(token: BoundToken<T, any>): UseServiceResult<T>

export function useService<T>(token: FactoryToken<T, any>): UseServiceResult<T>

export function useService(
  token: ClassType | Token<any, any> | BoundToken<any, any> | FactoryToken<any, any>,
  args?: unknown,
): UseServiceResult<any> {
  // useContainer returns ScopedContainer if inside ScopeProvider, otherwise Container
  // This automatically handles request-scoped services correctly.
  const container = useContainer()
  const rootContainer = useRootContainer()

  // v2 removed the throw-proxy: tryGetSync returns the instance or null for
  // any registered token. Probe synchronously on first render so an
  // already-cached instance renders without a loading flash and the effect
  // can skip the async fetch entirely. (useService is only meaningful for
  // registered services; the unregistered-class case is useOptionalService's
  // concern, which guards tryGetSync accordingly.)
  const initialSyncInstanceRef = useRef<unknown>(undefined)
  const isFirstRenderRef = useRef(true)
  if (isFirstRenderRef.current) {
    initialSyncInstanceRef.current = container.tryGetSync(token, args)
    isFirstRenderRef.current = false
  }

  const initialState: ServiceState<any> = initialSyncInstanceRef.current
    ? { status: 'success', data: initialSyncInstanceRef.current }
    : { status: 'loading', data: undefined }

  const [state, dispatch] = useReducer(
    (_: ServiceState<any>, next: ServiceState<any>) => next,
    initialState,
  )
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

  // Resolve the service and subscribe to its invalidation event so the hook
  // re-fetches when the instance is destroyed (or when refetch() is called).
  useEffect(() => {
    const eventBus = rootContainer.internals.eventBus
    let unsubscribe: (() => void) | undefined
    let isMounted = true

    const subscribe = () => {
      const instanceName = container.calculateInstanceName(token, args)
      if (instanceName) {
        unsubscribe = eventBus.on(instanceName, 'destroy', () => {
          if (isMounted) {
            dispatch({ status: 'loading', data: undefined })
            void fetchAndSubscribe()
          }
        })
      }
    }

    const fetchAndSubscribe = async () => {
      try {
        const instance = await container.get(
          // @ts-expect-error - token is a validated runtime union; get()'s typed
          // overloads can't be satisfied by AnyInjectableType at this boundary
          token as AnyInjectableType,
          args as any,
        )
        if (!isMounted) return
        dispatch({ status: 'success', data: instance })
        subscribe()
      } catch (error) {
        if (isMounted) {
          dispatch({ status: 'error', error: error as Error })
        }
      }
    }

    // Sync-fast-path: when the instance was already cached on first render and
    // no explicit refetch was requested, skip the async resolve and just
    // subscribe to invalidation.
    if (initialSyncInstanceRef.current && refetchCounter === 0) {
      subscribe()
    } else {
      void fetchAndSubscribe()
    }

    return () => {
      isMounted = false
      unsubscribe?.()
    }
  }, [container, rootContainer, token, args, refetchCounter])

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
