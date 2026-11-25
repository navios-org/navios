import { Container, inject, Injectable, InjectionToken, provide } from '@navios/di'
import { UnitTestContainer } from '@navios/di/testing'
import { act, render, screen, waitFor } from '@testing-library/react'
import { createElement, useMemo } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import { ContainerProvider } from '../../container/container-provider.mjs'
import { useOptionalService } from '../use-optional-service.mjs'

describe('useOptionalService', () => {
  let container: Container

  beforeEach(() => {
    container = new Container()
  })

  afterEach(async () => {
    await container.dispose()
    vi.clearAllMocks()
  })

  const createWrapper = (children: React.ReactNode) =>
    createElement(ContainerProvider, { container, children })

  describe('when service is registered', () => {
    it('should load the service successfully', async () => {
      @Injectable()
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
      const UserToken = InjectionToken.create<{ userId: string; name: string }, typeof UserSchema>(
        'User',
        UserSchema,
      )

      @Injectable({ token: UserToken })
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

    const statusOf = async (token: any, container: Container) => {
      function TestComponent() {
        const result = useOptionalService(token as InjectionToken<unknown>)
        const status = result.isNotFound
          ? 'not-found'
          : result.isError
            ? result.error!.message
            : result.isSuccess
              ? 'success'
              : 'pending'
        return createElement('div', { 'data-testid': 'status' }, status)
      }
      const { unmount } = render(
        createElement(ContainerProvider, {
          container,
          children: createElement(TestComponent),
        }),
      )
      await waitFor(() => {
        expect(screen.getByTestId('status').textContent).not.toBe('pending')
      })
      const status = screen.getByTestId('status').textContent
      unmount()
      await container.dispose()
      return status
    }

    it('should return isNotFound true for what a UnitTestContainer does not list', async () => {
      @Injectable()
      class Unlisted {}

      expect(await statusOf(Unlisted, new UnitTestContainer({ providers: [] }))).toBe('not-found')
    })

    it('should return an error when something the service asks for is missing', async () => {
      const MISSING = InjectionToken.create<string>('Missing')
      const FACTORY = InjectionToken.create<object>('Factory')
      const ALIAS = InjectionToken.create<string>('Alias')

      @Injectable()
      class Injecting {
        readonly missing = inject(MISSING)
      }

      @Injectable()
      class Getting {
        private readonly container = inject(Container)

        async onServiceInit() {
          await this.container.get(MISSING)
        }
      }

      const create = () =>
        new Container({
          providers: [
            provide(FACTORY, {
              factory: async (ctx) => ({ missing: await ctx.inject(MISSING) }),
            }),
            provide(ALIAS, { existing: MISSING }),
          ],
        })
      for (const token of [Injecting, Getting, FACTORY]) {
        expect(await statusOf(token, create())).toContain('No provider for')
      }
      // An alias of nothing is nothing.
      expect(await statusOf(ALIAS, create())).toBe('not-found')
    })

    it('should return isNotFound true for unregistered injection token', async () => {
      const UnregisteredToken = InjectionToken.create<{ value: string }>('Unregistered')

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

  describe('with inline args', () => {
    const defineUser = () => {
      const UserSchema = z.object({ userId: z.string() })
      const UserToken = InjectionToken.create<{ userId: string }, typeof UserSchema>(
        'User',
        UserSchema,
      )
      const log = { constructed: 0, renders: 0 }

      @Injectable({ token: UserToken })
      class _UserService {
        public userId: string

        constructor(args: z.infer<typeof UserSchema>) {
          log.constructed++
          this.userId = args.userId
        }
      }

      function TestComponent({ userId }: { userId: string }) {
        if (++log.renders > 200) {
          throw new Error('useOptionalService never settled')
        }
        const { data } = useOptionalService(UserToken, { userId })

        return createElement('div', { 'data-testid': 'result' }, data ? data.userId : 'loading')
      }

      return { UserToken, log, TestComponent }
    }

    it('should settle when args are a new object on every render', async () => {
      const { log, TestComponent } = defineUser()

      render(createWrapper(createElement(TestComponent, { userId: '123' })))

      await waitFor(() => {
        expect(screen.getByTestId('result').textContent).toBe('123')
      })

      // Let any further render loop show itself
      const settledAt = log.renders
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20))
      })

      expect(log.renders).toBe(settledAt)
      expect(log.renders).toBeLessThan(10)
      expect(log.constructed).toBe(1)
    })

    it('should resolve again when the args change', async () => {
      const { log, TestComponent } = defineUser()

      const { rerender } = render(createWrapper(createElement(TestComponent, { userId: '1' })))

      await waitFor(() => {
        expect(screen.getByTestId('result').textContent).toBe('1')
      })

      rerender(createWrapper(createElement(TestComponent, { userId: '2' })))

      await waitFor(() => {
        expect(screen.getByTestId('result').textContent).toBe('2')
      })
      expect(log.constructed).toBe(2)
    })

    it('should resolve again when the args of an already resolved instance change', async () => {
      const { UserToken, TestComponent } = defineUser()

      // Both instances exist before the hook mounts, so it reads them synchronously
      await container.get(UserToken, { userId: '1' })
      await container.get(UserToken, { userId: '2' })

      const { rerender } = render(createWrapper(createElement(TestComponent, { userId: '1' })))
      expect(screen.getByTestId('result').textContent).toBe('1')

      rerender(createWrapper(createElement(TestComponent, { userId: '2' })))
      await waitFor(() => {
        expect(screen.getByTestId('result').textContent).toBe('2')
      })

      rerender(createWrapper(createElement(TestComponent, { userId: '1' })))
      await waitFor(() => {
        expect(screen.getByTestId('result').textContent).toBe('1')
      })
    })
  })

  describe('service invalidation', () => {
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
        const { data } = useOptionalService(Dependent)
        current = data

        return createElement('div', { 'data-testid': 'result' }, data ? data.dependency.id : '-')
      }

      render(createWrapper(createElement(TestComponent)))

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
  })

  describe('refetch functionality', () => {
    it('should allow manual refetch', async () => {
      let instanceCount = 0

      @Injectable()
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
