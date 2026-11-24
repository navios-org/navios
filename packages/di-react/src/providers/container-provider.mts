import { useEffect } from 'react'
import { jsx } from 'react/jsx-runtime'

import type { Container } from '@navios/di'
import type { ReactNode } from 'react'

import { ContainerContext } from './context.mjs'
import { retainContainer } from './pending-scopes.mjs'

export interface ContainerProviderProps {
  container: Container
  children: ReactNode
}

export function ContainerProvider({ container, children }: ContainerProviderProps) {
  // Scopes created by `ScopeProvider` renders that never commit are disposed
  // when the last provider of the container unmounts.
  useEffect(() => retainContainer(container), [container])

  return jsx(ContainerContext.Provider, { value: container, children })
}
