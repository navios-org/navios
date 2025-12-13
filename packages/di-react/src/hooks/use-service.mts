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

import { useCallback, useContext, useEffect, useReducer, useRef, useState } from 'react'

import type { Join, UnionToArray } from '../types.mjs'

import { ScopeContext } from '../providers/scope-provider.mjs'
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

function serviceReducer<T>(
  state: ServiceState<T>,
  action: ServiceAction<T>,
): ServiceState<T> {
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
): UseServiceResult<
  InstanceType<T> extends Factorable<infer R> ? R : InstanceType<T>
>

// #2 Token with required Schema
export function useService<T, S extends InjectionTokenSchemaType>(
  token: InjectionToken<T, S>,
  args: z.input<S>,
): UseServiceResult<T>

// #3 Token with optional Schema
export function useService<
  T,
  S extends InjectionTokenSchemaType,
  R extends boolean,
>(
  token: InjectionToken<T, S, R>,
): R extends false
  ? UseServiceResult<T>
  : S extends ZodType<infer Type>
    ? `Error: Your token requires args: ${Join<UnionToArray<keyof Type>, ', '>}`
    : 'Error: Your token requires args'

// #4 Token with no Schema
export function useService<T>(
  token: InjectionToken<T, undefined>,
): UseServiceResult<T>

export function useService<T>(
  token: BoundInjectionToken<T, any>,
): UseServiceResult<T>

export function useService<T>(
  token: FactoryInjectionToken<T, any>,
): UseServiceResult<T>

export function useService(
  token:
    | ClassType
    | InjectionToken<any, any>
    | BoundInjectionToken<any, any>
    | FactoryInjectionToken<any, any>,
  args?: unknown,
): UseServiceResult<any> {
  const container = useContainer()
  const serviceLocator = container.getServiceLocator()
  const scopeId = useContext(ScopeContext)
  const [state, dispatch] = useReducer(serviceReducer, { status: 'idle' })
  const instanceNameRef = useRef<string | null>(null)
  const [refetchCounter, setRefetchCounter] = useState(0)

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

  // Subscribe to invalidation events
  useEffect(() => {
    const eventBus = serviceLocator.getEventBus()
    let unsubscribe: (() => void) | undefined
    let isMounted = true

    // Fetch the service and set up subscription
    const fetchAndSubscribe = async () => {
      try {
        // Set the correct request context before getting the instance
        // This ensures request-scoped services are resolved in the correct scope
        if (scopeId) {
          const requestContexts = serviceLocator.getRequestContexts()
          if (requestContexts.has(scopeId)) {
            container.setCurrentRequestContext(scopeId)
          }
        }

        const instance = await container.get(
          // @ts-expect-error - token is valid
          token as AnyInjectableType,
          args as any,
        )

        if (!isMounted) return

        // Get instance name for event subscription
        const instanceName = serviceLocator.getInstanceIdentifier(
          token as AnyInjectableType,
          args,
        )
        instanceNameRef.current = instanceName

        dispatch({ type: 'success', data: instance })

        // Set up subscription after we have the instance
        unsubscribe = eventBus.on(instanceName, 'destroy', () => {
          // Re-fetch when the service is invalidated
          if (isMounted) {
            dispatch({ type: 'loading' })
            void fetchAndSubscribe()
          }
        })
      } catch (error) {
        if (isMounted) {
          dispatch({ type: 'error', error: error as Error })
        }
      }
    }

    dispatch({ type: 'loading' })
    void fetchAndSubscribe()

    return () => {
      isMounted = false
      unsubscribe?.()
    }
  }, [container, serviceLocator, token, args, scopeId, refetchCounter])

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
