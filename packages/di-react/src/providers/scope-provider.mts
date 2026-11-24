import { useContext, useEffect, useId, useReducer, useRef } from 'react'
import { jsx } from 'react/jsx-runtime'

import type { ScopedContainer } from '@navios/di'
import type { ReactNode } from 'react'

import { ContainerContext, ScopedContainerContext } from './context.mjs'

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
export function ScopeProvider({ scopeId, metadata, children }: ScopeProviderProps) {
  const container = useContext(ContainerContext)
  if (!container) {
    throw new Error('ScopeProvider must be used within a ContainerProvider')
  }

  const generatedId = useId()
  const effectiveScopeId = scopeId ?? generatedId
  const scopedContainerRef = useRef<ScopedContainer | null>(null)
  // True between an effect setup and its cleanup.
  const isMountedRef = useRef(false)
  // True once the scope in the ref has been disposed.
  const isDisposedRef = useRef(false)
  const [, rerender] = useReducer((count: number) => count + 1, 0)

  // DI scopes have no ids, so the effective scope id lives in the scope's
  // metadata under `scopeId`.
  const createScope = () => container.createScope({ ...metadata, scopeId: effectiveScopeId })
  const createScopeRef = useRef(createScope)
  createScopeRef.current = createScope

  // Create the ScopedContainer once per mounted provider.
  // The ref keeps it stable across re-renders.
  if (!scopedContainerRef.current) {
    scopedContainerRef.current = createScope()
  }

  useEffect(() => {
    isMountedRef.current = true
    // React re-ran the effect after the scope was disposed (an `<Activity>`
    // shown again): the old scope is gone for good, so start a new one.
    if (isDisposedRef.current) {
      isDisposedRef.current = false
      scopedContainerRef.current = createScopeRef.current()
      rerender()
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
        void scopedContainerRef.current?.dispose()
      })
    }
  }, [])

  return jsx(ScopedContainerContext.Provider, {
    value: scopedContainerRef.current,
    children,
  })
}
