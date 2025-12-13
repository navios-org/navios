import { Container, Injectable, Registry } from '@navios/di'

import { renderHook } from '@testing-library/react'
import { createElement } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'

import { ContainerProvider } from '../../providers/container-provider.mjs'
import { useContainer } from '../use-container.mjs'

describe('useContainer', () => {
  let container: Container
  let registry: Registry

  beforeEach(() => {
    registry = new Registry()
    container = new Container(registry)
  })

  it('should return the container from context', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      // @ts-expect-error - container is required
      createElement(ContainerProvider, { container }, children)

    const { result } = renderHook(() => useContainer(), { wrapper })

    expect(result.current).toBe(container)
  })

  it('should throw an error when used outside of ContainerProvider', () => {
    expect(() => {
      renderHook(() => useContainer())
    }).toThrow('useContainer must be used within a ContainerProvider')
  })

  it('should provide access to container methods', async () => {
    @Injectable({ registry })
    class TestService {
      getValue() {
        return 'test-value'
      }
    }

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      // @ts-expect-error - props are not typed
      createElement(ContainerProvider, { container }, children)

    const { result } = renderHook(() => useContainer(), { wrapper })

    const service = await result.current.get(TestService)
    expect(service.getValue()).toBe('test-value')
  })
})
