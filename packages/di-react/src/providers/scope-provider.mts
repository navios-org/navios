import { useContext, useEffect, useId, useLayoutEffect, useReducer, useRef } from 'react'
import { Fragment, jsx } from 'react/jsx-runtime'

import type { ScopedContainer } from '@navios/di'
import type { ReactNode } from 'react'

import { ContainerContext, ScopedContainerContext } from './context.mjs'
import {
  acquireScope,
  commitScope,
  createCommittedScope,
  disposeScope,
  isScopeDisposed,
  sweepPendingScopes,
} from './pending-scopes.mjs'

// `useLayoutEffect` warns during server rendering on React 18.
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

export interface ScopeProviderProps {
  /**
   * Optional explicit scope ID. If not provided, a unique ID will be generated.
   * Useful when you need to reference the scope externally.
   */
  scopeId?: string
  /**
   * Optional metadata to attach to the scope.
   * The key `scopeId` is reserved: it always holds the effective scope ID.
   * Can be used to pass data like user info, request headers, etc.
   */
  metadata?: Record<string, unknown>
  children: ReactNode
}

/**
 * ScopeProvider creates a new request scope for dependency injection.
 *
 * Services with `scope: 'Request'` will be instantiated once per ScopeProvider
 * and shared among all components within that provider.
 *
 * This is useful for:
 * - Table rows that need isolated state
 * - Modal dialogs with their own service instances
 * - Multi-tenant scenarios
 * - Any case where you need isolated service instances
 *
 * @example
 * ```tsx
 * // Each row gets its own RowStateService instance
 * {rows.map(row => (
 *   <ScopeProvider key={row.id} scopeId={row.id} metadata={{ rowData: row }}>
 *     <TableRow />
 *   </ScopeProvider>
 * ))}
 * ```
 */
export function ScopeProvider(props: ScopeProviderProps) {
  const { scopeId, metadata, children } = props
  const container = useContext(ContainerContext)
  if (!container) {
    throw new Error('ScopeProvider must be used within a ContainerProvider')
  }

  const generatedId = useId()
  const scopedContainerRef = useRef<ScopedContainer | null>(null)
  // True between an effect setup and its cleanup.
  const isMountedRef = useRef(false)
  // True once the scope in the ref has been disposed.
  const isDisposedRef = useRef(false)
  const [, rerender] = useReducer((count: number) => count + 1, 0)
  // Changes when the children have to start over in a new scope.
  const [generation, remount] = useReducer((count: number) => count + 1, 0)

  // A scope for this provider once it is committed. The ref object stands for
  // the provider instance: it exists once per committed provider.
  const createScope = () =>
    createCommittedScope(container, scopeId, metadata, generatedId, scopedContainerRef)
  const createScopeRef = useRef(createScope)
  createScopeRef.current = createScope

  // The scope is needed during render, where the children resolve from it,
  // and the ref keeps it stable across re-renders. Until this provider
  // commits, the scope is pending: React may throw this render away, and a
  // later attempt picks the scope up again. See `pending-scopes.mts`.
  //
  // A provider can also render after its scope was disposed: inside an
  // `<Activity>` that is hidden, where no effect is mounted. It takes a new
  // pending scope then, so its children never resolve from a disposed one.
  if (!scopedContainerRef.current || isScopeDisposed(scopedContainerRef.current)) {
    scopedContainerRef.current = acquireScope(container, props, generatedId)
  }

  // A layout effect, so that every provider of a commit owns its scope before
  // the passive effects below look for scopes nobody committed.
  useIsomorphicLayoutEffect(() => {
    isMountedRef.current = true
    isDisposedRef.current = false
    const outcome = commitScope(scopedContainerRef.current!, scopedContainerRef)
    if (outcome !== 'committed') {
      scopedContainerRef.current = createScopeRef.current()
      if (outcome === 'taken') {
        // Another provider committed with the same pending scope, so the
        // children rendered against its instances: they start over.
        remount()
      } else {
        // The scope was disposed and the provider has not rendered since: an
        // `<Activity>` shown again, or a hidden one shown for the first time.
        rerender()
      }
    }
    return () => {
      isMountedRef.current = false
      // Disposal waits one microtask. StrictMode's simulated unmount is
      // followed by a re-mount in the same commit, which sets the flag again
      // and keeps the scope; a real unmount leaves it unset.
      queueMicrotask(() => {
        if (isMountedRef.current || isDisposedRef.current) {
          return
        }
        isDisposedRef.current = true
        if (scopedContainerRef.current) {
          disposeScope(scopedContainerRef.current)
        }
      })
    }
  }, [])

  // Every commit and unmount of a provider is a chance to dispose the scopes
  // of renders that never committed.
  useEffect(() => {
    sweepPendingScopes(container)
    return () => sweepPendingScopes(container)
  }, [container])

  return jsx(ScopedContainerContext.Provider, {
    value: scopedContainerRef.current,
    children: jsx(Fragment, { children }, generation),
  })
}
