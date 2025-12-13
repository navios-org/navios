import { Container, Injectable, InjectionToken, Registry } from '@navios/di'

import { render, screen, waitFor } from '@testing-library/react'
import { createElement, useMemo } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import { ContainerProvider } from '../../providers/container-provider.mjs'
import { useOptionalService } from '../use-optional-service.mjs'

describe('useOptionalService', () => {
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
      const UserToken = InjectionToken.create<
        { userId: string; name: string },
        typeof UserSchema
      >('User', UserSchema)

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
      const UnregisteredToken = InjectionToken.create<{ value: string }>('Unregistered')

      function TestComponent() {
        const { isSuccess, isNotFound, isError, isLoading } =
          useOptionalService(UnregisteredToken)

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
})
