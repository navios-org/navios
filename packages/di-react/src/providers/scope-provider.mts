import type { ReactNode } from 'react'

import { createContext, createElement, useEffect, useId, useRef } from 'react'

import { useContainer } from '../hooks/use-container.mjs'

/**
 * Context for the current scope ID.
 * This allows nested components to access the current request scope.
 */
export const ScopeContext = createContext<string | null>(null)

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
  /**
   * Priority for service resolution. Higher priority scopes take precedence.
   * @default 100
   */
  priority?: number
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
 *   <ScopeProvider key={row.id} scopeId={row.id}>
 *     <TableRow data={row} />
 *   </ScopeProvider>
 * ))}
 * ```
 */
export function ScopeProvider({
  scopeId,
  metadata,
  priority = 100,
  children,
}: ScopeProviderProps) {
  const container = useContainer()
  const generatedId = useId()
  const effectiveScopeId = scopeId ?? generatedId
  const isInitializedRef = useRef(false)

  // Begin request context on first render only
  // We use a ref to track initialization to handle React StrictMode double-renders
  if (!isInitializedRef.current) {
    // Check if context already exists (e.g., from StrictMode double render)
    const existingContexts = container.getServiceLocator().getRequestContexts()
    if (!existingContexts.has(effectiveScopeId)) {
      container.beginRequest(effectiveScopeId, metadata, priority)
    }
    isInitializedRef.current = true
  }

  // End request context on unmount
  useEffect(() => {
    return () => {
      void container.endRequest(effectiveScopeId)
    }
  }, [container, effectiveScopeId])

  return createElement(
    ScopeContext.Provider,
    { value: effectiveScopeId },
    children,
  )
}
