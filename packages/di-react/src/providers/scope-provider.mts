import { useContext, useEffect, useId, useRef } from 'react'
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
   * Optional metadata to attach to the request context.
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

  // Create ScopedContainer on first render only
  // We use a ref to track initialization to handle React StrictMode double-renders
  if (!scopedContainerRef.current) {
    // Check if this request ID already exists (e.g., from StrictMode double render)
    if (!container.hasActiveRequest(effectiveScopeId)) {
      scopedContainerRef.current = container.beginRequest(effectiveScopeId, metadata)
    }
  }

  // End request context on unmount
  useEffect(() => {
    const scopedContainer = scopedContainerRef.current
    return () => {
      if (scopedContainer) {
        void scopedContainer.endRequest()
      }
    }
  }, [])

  // If we don't have a scoped container (shouldn't happen normally), don't render
  if (!scopedContainerRef.current) {
    return null
  }

  return jsx(ScopedContainerContext.Provider, {
    value: scopedContainerRef.current,
    children,
  })
}
