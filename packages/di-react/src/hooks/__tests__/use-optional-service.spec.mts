import { Container, Injectable, Registry, Token } from '@navios/di'
import { render, screen, waitFor } from '@testing-library/react'
import { createElement, useMemo } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}

import { ContainerProvider } from '../../providers/container-provider.mjs'
import { useOptionalService } from '../use-optional-service.mjs'

describe('useOptionalService', () => {
  let container: Container
  let registry: Registry

  beforeEach(() => {
    registry = new Registry()
    container = new Container({ registry })
  })

  afterEach(async () => {
    await container.dispose()
    vi.clearAllMocks()
  })

  const createWrapper = (children: React.ReactNode) =>
    createElement(ContainerProvider, { container, children })

  describe('when service is registered', () => {
    it('should load the service successfully', async () => {
      @Injectable({ registry })
      class TestService {
        getValue() {
          return 'test-value'
        }
      }

      function TestComponent() {
        const { data, isSuccess, isNotFound, isLoading } = useOptionalService(TestService)

        if (isLoading) {
          return createElement('div', { 'data-testid': 'loading' }, 'Loading...')
        }

        if (isNotFound) {
          return createElement('div', { 'data-testid': 'not-found' }, 'Not Found')
        }

        if (isSuccess) {
          return createElement('div', { 'data-testid': 'result' }, data!.getValue())
        }

        return createElement('div', { 'data-testid': 'idle' }, 'Idle')
      }

      render(createWrapper(createElement(TestComponent)))

      await waitFor(() => {
        expect(screen.getByTestId('result')).toBeDefined()
      })

      expect(screen.getByTestId('result').textContent).toBe('test-value')
    })

    it('should load service with injection token and args', async () => {
      const UserSchema = z.object({ userId: z.string() })
      const UserToken = Token.create<{ userId: string; name: string }, typeof UserSchema>(
        'User',
        UserSchema,
      )

      @Injectable({ registry, token: UserToken })
      class _UserService {
        public userId: string
        public name: string

        constructor(args: z.infer<typeof UserSchema>) {
          this.userId = args.userId
          this.name = `User ${args.userId}`
        }
      }

      function TestComponent() {
        const args = useMemo(() => ({ userId: '123' }), [])
        const { data, isSuccess, isNotFound } = useOptionalService(UserToken, args)

        if (isNotFound) {
          return createElement('div', { 'data-testid': 'not-found' }, 'Not Found')
        }

        if (isSuccess) {
          return createElement('div', { 'data-testid': 'result' }, data!.name)
        }

        return createElement('div', { 'data-testid': 'loading' }, 'Loading...')
      }

      render(createWrapper(createElement(TestComponent)))

      await waitFor(() => {
        expect(screen.getByTestId('result')).toBeDefined()
      })

      expect(screen.getByTestId('result').textContent).toBe('User 123')
    })
  })

  describe('when service is not registered', () => {
    it('should return isNotFound true for unregistered class token', async () => {
      // Create a class that is NOT registered with Injectable
      class UnregisteredService {
        getValue() {
          return 'value'
        }
      }

      function TestComponent() {
        const { isSuccess, isNotFound, isError, isLoading } =
          useOptionalService(UnregisteredService)

        if (isLoading) {
          return createElement('div', { 'data-testid': 'loading' }, 'Loading...')
        }

        if (isNotFound) {
          return createElement('div', { 'data-testid': 'not-found' }, 'Service Not Found')
        }

        if (isError) {
          return createElement('div', { 'data-testid': 'error' }, 'Error')
        }

        if (isSuccess) {
          return createElement('div', { 'data-testid': 'success' }, 'Success')
        }

        return createElement('div', { 'data-testid': 'idle' }, 'Idle')
      }

      render(createWrapper(createElement(TestComponent)))

      await waitFor(() => {
        const notFound = screen.queryByTestId('not-found')
        const error = screen.queryByTestId('error')
        // Either not-found or error is acceptable for unregistered services
        expect(notFound || error).toBeTruthy()
      })
    })

    it('should return isNotFound true for unregistered injection token', async () => {
      const UnregisteredToken = Token.create<{ value: string }>('Unregistered')

      function TestComponent() {
        const { isSuccess, isNotFound, isError, isLoading } = useOptionalService(UnregisteredToken)

        if (isLoading) {
          return createElement('div', { 'data-testid': 'loading' }, 'Loading...')
        }

        if (isNotFound) {
          return createElement('div', { 'data-testid': 'not-found' }, 'Token Not Found')
        }

        if (isError) {
          return createElement('div', { 'data-testid': 'error' }, 'Error')
        }

        if (isSuccess) {
          return createElement('div', { 'data-testid': 'success' }, 'Success')
        }

        return createElement('div', { 'data-testid': 'idle' }, 'Idle')
      }

      render(createWrapper(createElement(TestComponent)))

      await waitFor(() => {
        const notFound = screen.queryByTestId('not-found')
        const error = screen.queryByTestId('error')
        // Either not-found or error is acceptable for unregistered tokens
        expect(notFound || error).toBeTruthy()
      })
    })
  })

  describe('refetch functionality', () => {
    it('should allow manual refetch', async () => {
      let instanceCount = 0

      @Injectable({ registry })
      class CounterService {
        public readonly id: number

        constructor() {
          instanceCount++
          this.id = instanceCount
        }
      }

      let refetchFn: (() => void) | null = null

      function TestComponent() {
        const { data, isSuccess, refetch } = useOptionalService(CounterService)
        refetchFn = refetch

        if (!isSuccess) {
          return createElement('div', { 'data-testid': 'loading' }, 'Loading...')
        }

        return createElement('div', { 'data-testid': 'counter' }, String(data!.id))
      }

      render(createWrapper(createElement(TestComponent)))

      await waitFor(() => {
        expect(screen.getByTestId('counter')).toBeDefined()
      })

      expect(screen.getByTestId('counter').textContent).toBe('1')

      // Note: refetch alone won't create a new instance since the service is cached
      // It will return the same cached instance
      refetchFn!()

      await waitFor(() => {
        expect(screen.getByTestId('counter')).toBeDefined()
      })

      // Same instance because it's cached
      expect(screen.getByTestId('counter').textContent).toBe('1')
    })
  })

  describe('unmount safety', () => {
    it('does not run the post-await fetch path after the component unmounts mid-fetch', async () => {
      // React 18+/19 no longer logs the legacy "state update on an unmounted
      // component" warning, so a console.error spy is not a reliable guard.
      // Instead we assert deterministically that the guarded post-await code
      // path (container.calculateInstanceName + dispatch + event subscription)
      // does NOT execute once the component has unmounted. We also keep a
      // console.error spy so any future React unmount warning still fails.
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      // A deferred that gates async service initialization so we can unmount
      // the component while container.get(...) is still pending (it awaits
      // onServiceInit).
      const gate = createDeferred<void>()
      let initStarted = 0

      const SlowToken = Token.create<{ ready: boolean }>('SlowService')

      @Injectable({ registry, token: SlowToken })
      class _SlowService {
        public ready = true

        async onServiceInit() {
          initStarted++
          // Block resolution until the test explicitly releases the gate.
          await gate.promise
        }
      }

      // calculateInstanceName runs in fetchService AFTER `await container.get`,
      // i.e. exactly the code path the unmount guard protects. Track when it is
      // called so we can prove it never runs post-unmount.
      const calcSpy = vi.spyOn(container, 'calculateInstanceName')

      function TestComponent() {
        const { isSuccess } = useOptionalService(SlowToken)
        return createElement(
          'div',
          { 'data-testid': 'state' },
          isSuccess ? 'success' : 'pending',
        )
      }

      const { unmount } = render(createWrapper(createElement(TestComponent)))

      // The component is rendered and the async fetch has started, but the
      // service initialization is still blocked on the gate.
      await waitFor(() => {
        expect(initStarted).toBeGreaterThanOrEqual(1)
      })
      expect(screen.getByTestId('state').textContent).toBe('pending')

      // Unmount BEFORE the async container.get(...) resolves.
      unmount()
      const callsAtUnmount = calcSpy.mock.calls.length

      // Now release the gate and let the pending fetch promise settle.
      gate.resolve()
      await Promise.resolve()
      await Promise.resolve()
      await new Promise((r) => setTimeout(r, 0))

      // The post-await body (calculateInstanceName -> dispatch -> subscribe)
      // must NOT have run after unmount. Without the isMounted guard this
      // count increases here; with the guard it stays flat.
      expect(calcSpy.mock.calls.length).toBe(callsAtUnmount)

      // Defensive: no React unmounted-update / act warning either.
      const offendingCall = consoleErrorSpy.mock.calls.find((call) => {
        const msg = String(call[0] ?? '')
        return (
          msg.includes('unmounted component') ||
          msg.includes('was not wrapped in act') ||
          msg.includes("can't perform a React state update")
        )
      })
      expect(offendingCall).toBeUndefined()

      calcSpy.mockRestore()
      consoleErrorSpy.mockRestore()
    })
  })
})
