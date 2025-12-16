import type { Container } from '@navios/di'
import type { ReactNode } from 'react'

import { jsx } from 'react/jsx-runtime'

import { ContainerContext } from './context.mjs'

export interface ContainerProviderProps {
  container: Container
  children: ReactNode
}

export function ContainerProvider({
  container,
  children,
}: ContainerProviderProps) {
  return jsx(ContainerContext.Provider, { value: container, children })
}
