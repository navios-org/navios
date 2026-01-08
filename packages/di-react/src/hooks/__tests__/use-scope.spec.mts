import { Container, globalRegistry, Registry } from '@navios/di'

import { renderHook } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ContainerProvider } from '../../providers/container-provider.mjs'
import { ScopeProvider } from '../../providers/scope-provider.mjs'
import {
  useScope,
  useScopedContainer,
  useScopedContainerOrThrow,
  useScopeMetadata,
  useScopeOrThrow,
} from '../use-scope.mjs'

describe('useScope', () => {
  let container: Container
  let registry: Registry

  beforeEach(() => {
    registry = new Registry(globalRegistry)
    container = new Container(registry)
  })

  afterEach(async () => {
    await container.dispose()
  })

  it('should return null when not inside a ScopeProvider', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      // @ts-expect-error - container is required
      createElement(ContainerProvider, { container }, children)

    const { result } = renderHook(() => useScope(), { wrapper })

    expect(result.current).toBeNull()
  })

  it('should return the scope ID when inside a ScopeProvider', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(
        ContainerProvider,
        // @ts-expect-error - props are not typed
        { container },
        // @ts-expect-error - props are not typed
        createElement(ScopeProvider, { scopeId: 'test-scope-123' }, children),
      )

    const { result } = renderHook(() => useScope(), { wrapper })

    expect(result.current).toBe('test-scope-123')
  })

  it('should return the innermost scope ID when nested', () => {
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

    const { result } = renderHook(() => useScope(), { wrapper })

    expect(result.current).toBe('inner-scope')
  })
})

describe('useScopeOrThrow', () => {
  let container: Container
  let registry: Registry

  beforeEach(() => {
    registry = new Registry(globalRegistry)
    container = new Container(registry)
  })

  afterEach(async () => {
    await container.dispose()
  })

  it('should throw when not inside a ScopeProvider', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      // @ts-expect-error - container is required
      createElement(ContainerProvider, { container }, children)

    expect(() => {
      renderHook(() => useScopeOrThrow(), { wrapper })
    }).toThrow('useScopeOrThrow must be used within a ScopeProvider')
  })

  it('should return the scope ID when inside a ScopeProvider', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(
        ContainerProvider,
        // @ts-expect-error - props are not typed
        { container },
        // @ts-expect-error - props are not typed
        createElement(ScopeProvider, { scopeId: 'test-scope' }, children),
      )

    const { result } = renderHook(() => useScopeOrThrow(), { wrapper })

    expect(result.current).toBe('test-scope')
  })
})

describe('useScopedContainer', () => {
  let container: Container
  let registry: Registry

  beforeEach(() => {
    registry = new Registry(globalRegistry)
    container = new Container(registry)
  })

  afterEach(async () => {
    await container.dispose()
  })

  it('should return null when not inside a ScopeProvider', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      // @ts-expect-error - container is required
      createElement(ContainerProvider, { container }, children)

    const { result } = renderHook(() => useScopedContainer(), { wrapper })

    expect(result.current).toBeNull()
  })

  it('should return the ScopedContainer when inside a ScopeProvider', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(
        ContainerProvider,
        // @ts-expect-error - props are not typed
        { container },
        // @ts-expect-error - props are not typed
        createElement(ScopeProvider, { scopeId: 'test-scope' }, children),
      )

    const { result } = renderHook(() => useScopedContainer(), { wrapper })

    expect(result.current).not.toBeNull()
    expect(result.current?.getRequestId()).toBe('test-scope')
  })
})

describe('useScopedContainerOrThrow', () => {
  let container: Container
  let registry: Registry

  beforeEach(() => {
    registry = new Registry(globalRegistry)
    container = new Container(registry)
  })

  afterEach(async () => {
    await container.dispose()
  })

  it('should throw when not inside a ScopeProvider', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      // @ts-expect-error - container is required
      createElement(ContainerProvider, { container }, children)

    expect(() => {
      renderHook(() => useScopedContainerOrThrow(), { wrapper })
    }).toThrow('useScopedContainerOrThrow must be used within a ScopeProvider')
  })

  it('should return the ScopedContainer when inside a ScopeProvider', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(
        ContainerProvider,
        // @ts-expect-error - props are not typed
        { container },
        // @ts-expect-error - props are not typed
        createElement(ScopeProvider, { scopeId: 'test-scope' }, children),
      )

    const { result } = renderHook(() => useScopedContainerOrThrow(), { wrapper })

    expect(result.current.getRequestId()).toBe('test-scope')
  })
})

describe('useScopeMetadata', () => {
  let container: Container
  let registry: Registry

  beforeEach(() => {
    registry = new Registry(globalRegistry)
    container = new Container(registry)
  })

  afterEach(async () => {
    await container.dispose()
  })

  it('should return undefined when not inside a ScopeProvider', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      // @ts-expect-error - container is required
      createElement(ContainerProvider, { container }, children)

    const { result } = renderHook(() => useScopeMetadata('someKey'), { wrapper })

    expect(result.current).toBeUndefined()
  })

  it('should return undefined when key does not exist', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(
        ContainerProvider,
        // @ts-expect-error - props are not typed
        { container },
        createElement(
          ScopeProvider,
          // @ts-expect-error - props are not typed
          { scopeId: 'test-scope', metadata: { existingKey: 'value' } },
          children,
        ),
      )

    const { result } = renderHook(() => useScopeMetadata('nonExistentKey'), {
      wrapper,
    })

    expect(result.current).toBeUndefined()
  })

  it('should return the metadata value when key exists', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(
        ContainerProvider,
        // @ts-expect-error - props are not typed
        { container },
        createElement(
          ScopeProvider,
          // @ts-expect-error - props are not typed
          {
            scopeId: 'test-scope',
            metadata: { userId: '123', theme: 'dark' },
          },
          children,
        ),
      )

    // Test both values in a single hook to ensure they're from the same scope
    const { result } = renderHook(
      () => ({
        userId: useScopeMetadata<string>('userId'),
        theme: useScopeMetadata<string>('theme'),
      }),
      { wrapper },
    )

    expect(result.current.userId).toBe('123')
    expect(result.current.theme).toBe('dark')
  })

  it('should return metadata from the innermost scope', () => {
    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(
        ContainerProvider,
        // @ts-expect-error - props are not typed
        { container },
        createElement(
          ScopeProvider,
          // @ts-expect-error - props are not typed
          { scopeId: 'outer-scope', metadata: { value: 'outer' } },
          createElement(
            ScopeProvider,
            // @ts-expect-error - props are not typed
            { scopeId: 'inner-scope', metadata: { value: 'inner' } },
            children,
          ),
        ),
      )

    const { result } = renderHook(() => useScopeMetadata<string>('value'), {
      wrapper,
    })

    expect(result.current).toBe('inner')
  })
})
