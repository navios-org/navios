import { Container, Injectable } from '@navios/di'
import { renderHook } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { ScopedContainer } from '@navios/di'

import { ScopeProvider } from '../../scope/scope-provider.mjs'
import { ContainerProvider } from '../container-provider.mjs'
import { useContainer, useRootContainer } from '../use-container.mjs'

describe('useContainer', () => {
  let container: Container

  beforeEach(() => {
    container = new Container()
  })

  afterEach(async () => {
    await container.dispose()
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
    @Injectable()
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

  it('should return ScopedContainer when inside ScopeProvider', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(
        ContainerProvider,
        // @ts-expect-error - props are not typed
        { container },
        // @ts-expect-error - props are not typed
        createElement(ScopeProvider, { scopeId: 'test-scope' }, children),
      )

    const { result } = renderHook(() => useContainer(), { wrapper })

    // Should return the scoped container, not the root container
    expect(result.current).not.toBe(container)
    expect((result.current as ScopedContainer).getMetadata('scopeId')).toBe('test-scope')
  })
})

describe('useRootContainer', () => {
  let container: Container

  beforeEach(() => {
    container = new Container()
  })

  afterEach(async () => {
    await container.dispose()
  })

  it('should return the root container from context', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      // @ts-expect-error - container is required
      createElement(ContainerProvider, { container }, children)

    const { result } = renderHook(() => useRootContainer(), { wrapper })

    expect(result.current).toBe(container)
  })

  it('should throw an error when used outside of ContainerProvider', () => {
    expect(() => {
      renderHook(() => useRootContainer())
    }).toThrow('useRootContainer must be used within a ContainerProvider')
  })

  it('should return root container even when inside ScopeProvider', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(
        ContainerProvider,
        // @ts-expect-error - props are not typed
        { container },
        // @ts-expect-error - props are not typed
        createElement(ScopeProvider, { scopeId: 'test-scope' }, children),
      )

    const { result } = renderHook(() => useRootContainer(), { wrapper })

    // Should always return the root container, not the scoped container
    expect(result.current).toBe(container)
  })

  it('should return root container from deeply nested scopes', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(
        ContainerProvider,
        // @ts-expect-error - props are not typed
        { container },
        createElement(
          ScopeProvider,
          // @ts-expect-error - props are not typed
          { scopeId: 'outer-scope' },
          // @ts-expect-error - props are not typed
          createElement(ScopeProvider, { scopeId: 'inner-scope' }, children),
        ),
      )

    const { result } = renderHook(() => useRootContainer(), { wrapper })

    // Should always return the root container
    expect(result.current).toBe(container)
  })
})
