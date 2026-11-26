import { Container, inject, Injectable, InjectionToken } from '@navios/di'
import { act, render, screen, waitFor } from '@testing-library/react'
import { Component, createElement, Suspense, useMemo } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import type { ReactNode } from 'react'

import { ContainerProvider } from '../../container/container-provider.mjs'
import { useSuspenseService } from '../use-suspense-service.mjs'

describe('useSuspenseService', () => {
  let container: Container

  beforeEach(() => {
    container = new Container()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  const createWrapper = (children: React.ReactNode) =>
    createElement(ContainerProvider, { container, children })

  describe('with class tokens', () => {
    it('should suspend while loading and render data when resolved', async () => {
      @Injectable()
      class TestService {
        getValue() {
          return 'suspense-value'
        }
      }

      function TestComponent() {
        const service = useSuspenseService(TestService)
        return createElement('div', { 'data-testid': 'result' }, service.getValue())
      }

      render(
        createWrapper(
          createElement(
            Suspense,
            {
              fallback: createElement('div', { 'data-testid': 'loading' }, 'Loading...'),
            },
            createElement(TestComponent),
          ),
        ),
      )

      // Should show loading initially
      expect(screen.getByTestId('loading')).toBeDefined()

      // Should show result after loading
      await waitFor(() => {
        expect(screen.getByTestId('result')).toBeDefined()
      })

      expect(screen.getByTestId('result').textContent).toBe('suspense-value')
    })
  })

  describe('errors', () => {
    class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
      state: { error: Error | null } = { error: null }

      static getDerivedStateFromError(error: Error) {
        return { error }
      }

      render() {
        if (this.state.error) {
          return createElement(
            'button',
            { 'data-testid': 'error', onClick: () => this.setState({ error: null }) },
            this.state.error.message,
          )
        }
        return this.props.children
      }
    }

    const renderFlaky = () => {
      const log = { attempts: 0, renders: 0, failing: true, release: null as (() => void) | null }

      @Injectable()
      class Flaky {
        readonly value = 'ready'

        async onServiceInit() {
          log.attempts++
          if (log.failing) {
            throw new Error('Not ready yet')
          }
          await new Promise<void>((resolve) => {
            log.release = resolve
          })
        }
      }

      function TestComponent() {
        if (++log.renders > 100) {
          throw new Error('useSuspenseService never settled')
        }
        const service = useSuspenseService(Flaky)
        return createElement('div', { 'data-testid': 'result' }, service.value)
      }

      render(
        createWrapper(
          createElement(
            Boundary,
            null,
            createElement(
              Suspense,
              { fallback: createElement('div', { 'data-testid': 'loading' }, 'Loading...') },
              createElement(TestComponent),
            ),
          ),
        ),
      )

      return log
    }

    beforeEach(() => {
      // React reports the errors an error boundary catches
      vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('should throw the error to the error boundary once', async () => {
      const log = renderFlaky()

      await waitFor(() => {
        expect(screen.getByTestId('error').textContent).toContain('Not ready yet')
      })
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20))
      })

      expect(screen.getByTestId('error').textContent).toContain('Not ready yet')
      expect(log.attempts).toBe(1)
    })

    it('should resolve again after the error boundary is reset', async () => {
      const log = renderFlaky()

      await waitFor(() => {
        expect(screen.getByTestId('error')).toBeDefined()
      })
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20))
      })

      log.failing = false
      await act(async () => {
        screen.getByTestId('error').click()
      })

      // Suspends again for the next resolution
      await waitFor(() => {
        expect(log.release).not.toBeNull()
      })
      expect(screen.getByTestId('loading')).toBeDefined()
      expect(log.attempts).toBe(2)

      await act(async () => {
        log.release!()
      })
      await waitFor(() => {
        expect(screen.getByTestId('result').textContent).toBe('ready')
      })
      expect(log.attempts).toBe(2)
    })
  })

  describe('with injection tokens', () => {
    it('should load service with injection token', async () => {
      const ConfigToken = InjectionToken.create<{ apiUrl: string }>('Config')

      @Injectable({ token: ConfigToken })
      class _ConfigService {
        apiUrl = 'https://api.example.com'
      }

      function TestComponent() {
        const config = useSuspenseService(ConfigToken)
        return createElement('div', { 'data-testid': 'url' }, config.apiUrl)
      }

      render(
        createWrapper(
          createElement(
            Suspense,
            {
              fallback: createElement('div', { 'data-testid': 'loading' }, 'Loading...'),
            },
            createElement(TestComponent),
          ),
        ),
      )

      await waitFor(() => {
        expect(screen.getByTestId('url')).toBeDefined()
      })

      expect(screen.getByTestId('url').textContent).toBe('https://api.example.com')
    })

    it('should load service with injection token and args', async () => {
      const UserSchema = z.object({ userId: z.string() })
      const UserToken = InjectionToken.create<
        { userId: string; displayName: string },
        typeof UserSchema
      >('User', UserSchema)

      @Injectable({ token: UserToken })
      class _UserService {
        public userId: string
        public displayName: string

        constructor(args: z.infer<typeof UserSchema>) {
          this.userId = args.userId
          this.displayName = `User #${args.userId}`
        }
      }

      function TestComponent() {
        const args = useMemo(() => ({ userId: '456' }), [])
        const user = useSuspenseService(UserToken, args)
        return createElement('div', { 'data-testid': 'user' }, user.displayName)
      }

      render(
        createWrapper(
          createElement(
            Suspense,
            {
              fallback: createElement('div', { 'data-testid': 'loading' }, 'Loading...'),
            },
            createElement(TestComponent),
          ),
        ),
      )

      await waitFor(() => {
        expect(screen.getByTestId('user')).toBeDefined()
      })

      expect(screen.getByTestId('user').textContent).toBe('User #456')
    })
  })

  describe('caching behavior', () => {
    it('should return cached instance on subsequent renders', async () => {
      let constructorCallCount = 0

      @Injectable()
      class CachedService {
        public instanceId: number

        constructor() {
          constructorCallCount++
          this.instanceId = constructorCallCount
        }
      }

      function TestComponent() {
        const service = useSuspenseService(CachedService)
        return createElement('div', { 'data-testid': 'id' }, String(service.instanceId))
      }

      const { rerender } = render(
        createWrapper(
          createElement(
            Suspense,
            { fallback: createElement('div', null, 'Loading...') },
            createElement(TestComponent),
          ),
        ),
      )

      await waitFor(() => {
        expect(screen.getByTestId('id')).toBeDefined()
      })

      expect(screen.getByTestId('id').textContent).toBe('1')

      // Re-render the component
      rerender(
        createWrapper(
          createElement(
            Suspense,
            { fallback: createElement('div', null, 'Loading...') },
            createElement(TestComponent),
          ),
        ),
      )

      // Should still have the same instance (cached)
      expect(screen.getByTestId('id').textContent).toBe('1')
      expect(constructorCallCount).toBe(1)
    })
  })

  describe('service invalidation', () => {
    // Skip this test - invalidation with suspense cache is complex to test
    // The functionality is tested in useService tests
    it('should construct a dependent once when its dependency is invalidated', async () => {
      const log = { dependency: 0, dependent: 0 }

      @Injectable()
      class Dependency {
        readonly id = ++log.dependency
      }

      @Injectable()
      class Dependent {
        readonly dependency = inject(Dependency)
        readonly id = ++log.dependent
      }

      let current: Dependent | undefined

      function TestComponent() {
        current = useSuspenseService(Dependent)
        return createElement('div', { 'data-testid': 'result' }, current.dependency.id)
      }

      render(
        createWrapper(
          createElement(
            Suspense,
            { fallback: createElement('div', { 'data-testid': 'loading' }, 'Loading...') },
            createElement(TestComponent),
          ),
        ),
      )

      await waitFor(() => {
        expect(screen.getByTestId('result').textContent).toBe('1')
      })

      await act(async () => {
        await container.invalidate(current!.dependency)
      })

      await waitFor(() => {
        expect(screen.getByTestId('result').textContent).toBe('2')
      })
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20))
      })

      expect(log).toEqual({ dependency: 2, dependent: 2 })
    })

    it('should re-fetch when service is invalidated', async () => {
      let instanceCount = 0

      @Injectable()
      class InvalidatableService {
        public instanceId: number

        constructor() {
          instanceCount++
          this.instanceId = instanceCount
        }

        getId() {
          return this.instanceId
        }
      }

      function TestComponent() {
        const service = useSuspenseService(InvalidatableService)
        return createElement('div', { 'data-testid': 'instance-id' }, [String(service.getId())])
      }

      render(
        createWrapper(
          createElement(
            Suspense,
            {
              fallback: createElement('div', { 'data-testid': 'loading' }, 'Loading...'),
            },
            createElement(TestComponent),
          ),
        ),
      )

      await waitFor(() => {
        expect(screen.getByTestId('instance-id')).toBeDefined()
      })

      expect(screen.getByTestId('instance-id').textContent).toBe('1')

      // Get the current instance and invalidate it
      const currentInstance = await container.get(InvalidatableService)
      await act(async () => {
        await container.invalidate(currentInstance)
      })

      // Wait for re-fetch
      await waitFor(
        () => {
          expect(screen.getByTestId('instance-id').textContent).toBe('2')
        },
        { timeout: 2000 },
      )
    })
  })
})
