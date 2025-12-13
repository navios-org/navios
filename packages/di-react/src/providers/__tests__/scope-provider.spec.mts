import { Container, Injectable, InjectableScope, Registry } from '@navios/di'

import { render, screen, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useService } from '../../hooks/use-service.mjs'
import { useScope } from '../../hooks/use-scope.mjs'
import { ContainerProvider } from '../container-provider.mjs'
import { ScopeProvider } from '../scope-provider.mjs'

describe('ScopeProvider', () => {
  let container: Container
  let registry: Registry

  beforeEach(() => {
    registry = new Registry()
    container = new Container(registry)
  })

  afterEach(async () => {
    await container.dispose()
    vi.clearAllMocks()
  })

  const createWrapper = (children: React.ReactNode) =>
    createElement(ContainerProvider, { container, children })

  describe('useScope', () => {
    it('should return null when not inside ScopeProvider', () => {
      let scopeValue: string | null = 'not-set'

      function TestComponent() {
        scopeValue = useScope()
        return createElement('div', { 'data-testid': 'test' }, 'Test')
      }

      render(createWrapper(createElement(TestComponent)))

      expect(scopeValue).toBeNull()
    })

    it('should return scope ID when inside ScopeProvider', () => {
      let scopeValue: string | null = null

      function TestComponent() {
        scopeValue = useScope()
        return createElement(
          'div',
          { 'data-testid': 'test' },
          scopeValue ?? 'no-scope',
        )
      }

      render(
        createWrapper(
          createElement(
            ScopeProvider,
            // @ts-expect-error - props are not typed
            { scopeId: 'test-scope' },
            createElement(TestComponent),
          ),
        ),
      )

      expect(scopeValue).toBe('test-scope')
    })

    it('should generate unique scope ID when not provided', () => {
      let scopeValue: string | null = null

      function TestComponent() {
        scopeValue = useScope()
        return createElement(
          'div',
          { 'data-testid': 'test' },
          scopeValue ?? 'no-scope',
        )
      }

      render(
        createWrapper(
          createElement(ScopeProvider, null, createElement(TestComponent)),
        ),
      )

      expect(scopeValue).not.toBeNull()
      expect(typeof scopeValue).toBe('string')
    })
  })

  describe('request-scoped services', () => {
    it('should create separate instances for different scopes', async () => {
      let instanceCount = 0

      @Injectable({ registry, scope: InjectableScope.Request })
      class RequestScopedService {
        public readonly id: number

        constructor() {
          instanceCount++
          this.id = instanceCount
        }
      }

      function ServiceDisplay({ testId }: { testId: string }) {
        const { data, isSuccess } = useService(RequestScopedService)

        if (!isSuccess) {
          return createElement(
            'div',
            { 'data-testid': `${testId}-loading` },
            'Loading...',
          )
        }

        return createElement('div', { 'data-testid': testId }, String(data!.id))
      }

      render(
        createWrapper(
          createElement('div', null, [
            createElement(
              ScopeProvider,
              // @ts-expect-error - props are not typed
              { key: 'scope1', scopeId: 'scope-1' },
              createElement(ServiceDisplay, { testId: 'service-1' }),
            ),
            createElement(
              ScopeProvider,
              // @ts-expect-error - props are not typed
              { key: 'scope2', scopeId: 'scope-2' },
              createElement(ServiceDisplay, { testId: 'service-2' }),
            ),
          ]),
        ),
      )

      await waitFor(() => {
        expect(screen.getByTestId('service-1')).toBeDefined()
        expect(screen.getByTestId('service-2')).toBeDefined()
      })

      // Each scope should have its own instance
      const service1Id = screen.getByTestId('service-1').textContent
      const service2Id = screen.getByTestId('service-2').textContent

      expect(service1Id).not.toBe(service2Id)
      expect(instanceCount).toBe(2)
    })

    // This test is skipped because the DI package doesn't currently support
    // concurrent access to request-scoped services from multiple components.
    // When two components mount simultaneously and request the same request-scoped
    // service, a race condition occurs in the DI's instance resolution.
    // TODO: Fix in @navios/di by adding proper locking/deduplication for request-scoped services.
    it.skip('should share instances within the same scope', async () => {
      let instanceCount = 0

      @Injectable({ registry, scope: InjectableScope.Request })
      class RequestScopedService {
        public readonly id: number

        constructor() {
          instanceCount++
          this.id = instanceCount
        }
      }

      function ServiceDisplay({ testId }: { testId: string }) {
        const { data, isSuccess } = useService(RequestScopedService)

        if (!isSuccess) {
          return createElement(
            'div',
            { 'data-testid': `${testId}-loading` },
            'Loading...',
          )
        }

        return createElement('div', { 'data-testid': testId }, String(data!.id))
      }

      render(
        createWrapper(
          createElement(
            ScopeProvider,
            // @ts-expect-error - props are not typed
            { scopeId: 'shared-scope' },
            createElement('div', null, [
              createElement(ServiceDisplay, { key: '1', testId: 'service-a' }),
              createElement(ServiceDisplay, { key: '2', testId: 'service-b' }),
            ]),
          ),
        ),
      )

      await waitFor(() => {
        expect(screen.getByTestId('service-a')).toBeDefined()
        expect(screen.getByTestId('service-b')).toBeDefined()
      })

      // Both components in the same scope should share the instance
      const serviceAId = screen.getByTestId('service-a').textContent
      const serviceBId = screen.getByTestId('service-b').textContent

      expect(serviceAId).toBe(serviceBId)
      expect(instanceCount).toBe(1)
    })
  })

  describe('nested scopes', () => {
    it('should support nested scope providers', () => {
      let outerScope: string | null = null
      let innerScope: string | null = null

      function OuterComponent() {
        outerScope = useScope()
        return createElement(
          ScopeProvider,
          // @ts-expect-error - props are not typed
          { scopeId: 'inner-scope' },
          createElement(InnerComponent),
        )
      }

      function InnerComponent() {
        innerScope = useScope()
        return createElement(
          'div',
          { 'data-testid': 'inner' },
          innerScope ?? 'no-scope',
        )
      }

      render(
        createWrapper(
          createElement(
            ScopeProvider,
            // @ts-expect-error - props are not typed
            { scopeId: 'outer-scope' },
            createElement(OuterComponent),
          ),
        ),
      )

      expect(outerScope).toBe('outer-scope')
      expect(innerScope).toBe('inner-scope')
    })
  })

  describe('with metadata', () => {
    it('should accept metadata prop', () => {
      let scopeValue: string | null = null

      function TestComponent() {
        scopeValue = useScope()
        return createElement('div', { 'data-testid': 'test' }, 'Test')
      }

      // Just verify it doesn't throw with metadata
      render(
        createWrapper(
          createElement(
            ScopeProvider,
            // @ts-expect-error - props are not typed
            {
              scopeId: 'test-scope',
              metadata: { userId: '123', role: 'admin' },
              priority: 200,
            },
            createElement(TestComponent),
          ),
        ),
      )

      expect(scopeValue).toBe('test-scope')
    })
  })
})
