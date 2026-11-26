import { DIError, DIErrorCode } from '@navios/di'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { AnyInjectableType, Container, InjectionToken, ScopedContainer } from '@navios/di'

import { useContainer } from '../container/use-container.mjs'

import { getArgsKey } from './args-key.mjs'

import type { AnyServiceToken, UseServiceResult } from './types.mjs'

export type ResolvedServiceState<T> =
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'not-found' }
  | { status: 'error'; error: Error }

// One object each, so setting a state the hook is already in does not render.
const LOADING: ResolvedServiceState<never> = { status: 'loading' }
const NOT_FOUND: ResolvedServiceState<never> = { status: 'not-found' }

/**
 * The instance read synchronously during the first render, with the
 * container, token and args it was read for.
 */
interface InitialSync {
  container: object
  token: object
  argsKey: string
  instance: unknown
}

interface ResolvedService<T> {
  state: ResolvedServiceState<T>
  refetch: () => void
}

/** Whether `error` says that `token` itself has no provider. */
function isMissingProvider(
  container: Container | ScopedContainer,
  token: AnyServiceToken,
  error: unknown,
): boolean {
  return (
    error instanceof DIError &&
    error.code === DIErrorCode.ProviderNotFound &&
    // It may be something the service depends on.
    !container.isRegistered(token)
  )
}

/** What the container holds for `token` and `args` now, or `null`. */
function peekInstance(
  container: Container | ScopedContainer,
  token: AnyServiceToken,
  args: unknown,
): unknown {
  try {
    return container.peek(token as InjectionToken<any, any>, args)
  } catch {
    // A token the container cannot read, an alias cycle or args that contain
    // themselves. The resolution in the effect reports the error.
    return null
  }
}

/**
 * Resolution behind `useService` and `useOptionalService`. With `optional`,
 * a token without a provider ends in `not-found` instead of `error`.
 */
export function useResolvedService(
  token: AnyServiceToken,
  args: unknown,
  { optional }: { optional: boolean },
): ResolvedService<any> {
  // useContainer returns ScopedContainer if inside ScopeProvider, otherwise Container
  // This automatically handles request-scoped services correctly
  const container = useContainer()

  // Args that serialize the same are the same args: an object literal in the
  // call must not restart the hook on every render.
  const argsKey = getArgsKey(args)
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  const stableArgs = useMemo(() => args, [argsKey])

  // An instance the container already holds is returned by the first render,
  // without a loading state. The ref remembers what it was read for, so the
  // shortcut is only taken for that container, token and args.
  const initialSyncRef = useRef<InitialSync | null | undefined>(undefined)

  if (initialSyncRef.current === undefined) {
    const instance = peekInstance(container, token, args)
    initialSyncRef.current = instance === null ? null : { container, token, argsKey, instance }
  }

  const [state, setState] = useState<ResolvedServiceState<any>>(() =>
    initialSyncRef.current ? { status: 'success', data: initialSyncRef.current.instance } : LOADING,
  )
  const [refetchCount, setRefetchCount] = useState(0)

  useEffect(() => {
    // False once the container, token or args change, refetch is called or
    // the component unmounts: a resolution started by this run is then stale.
    let isCurrent = true
    let unsubscribe: (() => void) | undefined

    // The container routes the listener to the store that owns the instance
    // (the root store for singletons, the scope's store for request-scoped).
    const subscribe = () => {
      if (unsubscribe) return
      unsubscribe = container.onInvalidate(token, stableArgs, () => {
        if (!isCurrent) return
        setState(LOADING)
        // Listeners run once the invalidation has finished, so resolving here
        // builds the service once. The microtask only keeps the resolution out
        // of the container's notification loop.
        queueMicrotask(() => {
          if (isCurrent) {
            void resolve()
          }
        })
      })
    }

    const resolve = async () => {
      try {
        const instance = await container.get(
          // @ts-expect-error - token is valid
          token as AnyInjectableType,
          stableArgs as any,
        )
        if (!isCurrent) return
        setState({ status: 'success', data: instance })
        subscribe()
      } catch (error) {
        if (!isCurrent) return
        setState(
          optional && isMissingProvider(container, token, error)
            ? NOT_FOUND
            : { status: 'error', error: error as Error },
        )
      }
    }

    // If the instance read during the first render is still the one asked
    // for, just set up the subscription. Otherwise, resolve.
    const initial = initialSyncRef.current
    if (
      initial &&
      initial.container === container &&
      initial.token === token &&
      initial.argsKey === argsKey &&
      refetchCount === 0
    ) {
      subscribe()
    } else {
      initialSyncRef.current = null
      setState(LOADING)
      void resolve()
    }

    return () => {
      isCurrent = false
      unsubscribe?.()
    }
  }, [container, token, stableArgs, argsKey, refetchCount, optional])

  const refetch = useCallback(() => {
    setRefetchCount((count) => count + 1)
  }, [])

  return { state, refetch }
}

/** The result object of `useService` for a state. */
export function serviceResult<T>(
  state: ResolvedServiceState<T>,
  refetch: () => void,
): UseServiceResult<T> {
  return {
    data: state.status === 'success' ? state.data : undefined,
    error: state.status === 'error' ? state.error : undefined,
    isLoading: state.status === 'loading',
    isSuccess: state.status === 'success',
    isError: state.status === 'error',
    refetch,
  }
}
