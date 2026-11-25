import { Container, inject, Injectable, InjectionToken } from '@navios/di'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement, useMemo } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import { ContainerProvider } from '../../container/container-provider.mjs'
import { useService } from '../use-service.mjs'

describe('useService', () => {
  let container: Container

  beforeEach(() => {
    container = new Container()
  })

  afterEach(async () => {
    await container.dispose()
  })

  const createWrapper = () => {
    return ({ children }: { children: React.ReactNode }) =>
      // @ts-expect-error - container is required
      createElement(ContainerProvider, { container }, children)
  }

  describe('with class tokens', () => {
    it('should load a service and return success state', async () => {
      @Injectable()
      class TestService {
        getValue() {
          return 'test-value'
        }
      }

      const { result } = renderHook(() => useService(TestService), {
        wrapper: createWrapper(),
      })

      // Initially loading
      expect(result.current.isLoading).toBe(true)
      expect(result.current.data).toBeUndefined()

      // Wait for success
      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toBeInstanceOf(TestService)
      expect(result.current.data?.getValue()).toBe('test-value')
      expect(result.current.isLoading).toBe(false)
      expect(result.current.isError).toBe(false)
    })

    it('should return error state when service fails to load', async () => {
      @Injectable()
      class FailingService {
        constructor() {
          throw new Error('Service initialization failed')
        }
      }

      const { result } = renderHook(() => useService(FailingService), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      })

      expect(result.current.error?.message).toContain('Service initialization failed')
      expect(result.current.data).toBeUndefined()
      expect(result.current.isLoading).toBe(false)
      expect(result.current.isSuccess).toBe(false)
    })

    it('should refetch service when refetch is called', async () => {
      let callCount = 0

      @Injectable()
      class CountingService {
        public count: number

        constructor() {
          callCount++
          this.count = callCount
        }
      }

      const { result } = renderHook(() => useService(CountingService), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data?.count).toBe(1)

      // Invalidate the service first so refetch creates a new instance
      await container.invalidate(result.current.data)

      // Trigger refetch
      await act(async () => {
        result.current.refetch()
      })

      await waitFor(() => {
        expect(result.current.data?.count).toBe(2)
      })
    })
  })

  describe('with injection tokens', () => {
    it('should load a service with injection token', async () => {
      const TestToken = InjectionToken.create<{ value: string }>('TestToken')

      @Injectable({ token: TestToken })
      class TestService {
        value = 'token-value'
      }

      const { result } = renderHook(() => useService(TestToken), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data?.value).toBe('token-value')
    })

    it('should load a service with injection token and args', async () => {
      const UserSchema = z.object({ userId: z.string() })
      const UserToken = InjectionToken.create<{ userId: string; name: string }, typeof UserSchema>(
        'User',
        UserSchema,
      )

      @Injectable({ token: UserToken })
      class UserService {
        public userId: string
        public name: string

        constructor(args: z.infer<typeof UserSchema>) {
          this.userId = args.userId
          this.name = `User-${args.userId}`
        }
      }

      const { result } = renderHook(
        () => {
          const args = useMemo(() => ({ userId: '123' }), [])
          return useService(UserToken, args)
        },
        { wrapper: createWrapper() },
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data?.userId).toBe('123')
      expect(result.current.data?.name).toBe('User-123')
    })
  })

  describe('with inline args', () => {
    const defineUser = () => {
      const UserSchema = z.object({ userId: z.string() })
      const UserToken = InjectionToken.create<{ userId: string }, typeof UserSchema>(
        'User',
        UserSchema,
      )
      const log = { constructed: 0 }

      @Injectable({ token: UserToken })
      class _UserService {
        public userId: string

        constructor(args: z.infer<typeof UserSchema>) {
          log.constructed++
          this.userId = args.userId
        }
      }

      return { UserToken, log }
    }

    it('should settle when args are a new object on every render', async () => {
      const { UserToken, log } = defineUser()
      let renders = 0

      const { result } = renderHook(
        () => {
          renders++
          if (renders > 200) {
            throw new Error('useService never settled')
          }
          return useService(UserToken, { userId: '123' })
        },
        { wrapper: createWrapper() },
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })
      expect(result.current.data?.userId).toBe('123')

      // Let any further render loop show itself
      const settledAt = renders
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20))
      })

      expect(renders).toBe(settledAt)
      expect(renders).toBeLessThan(10)
      expect(log.constructed).toBe(1)
    })

    it('should keep the instance when a re-render passes equal args', async () => {
      const { UserToken, log } = defineUser()
      const states: boolean[] = []

      const { result, rerender } = renderHook(
        () => {
          const service = useService(UserToken, { userId: '123' })
          states.push(service.isLoading)
          if (states.length > 200) {
            throw new Error('useService never settled')
          }
          return service
        },
        { wrapper: createWrapper() },
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })
      const instance = result.current.data
      states.length = 0

      rerender()
      await act(async () => {})

      expect(result.current.data).toBe(instance)
      expect(states).not.toContain(true)
      expect(log.constructed).toBe(1)
    })

    it('should resolve again when the args change', async () => {
      const { UserToken, log } = defineUser()

      let renders = 0

      const { result, rerender } = renderHook(
        ({ userId }: { userId: string }) => {
          if (++renders > 200) {
            throw new Error('useService never settled')
          }
          return useService(UserToken, { userId })
        },
        { wrapper: createWrapper(), initialProps: { userId: '1' } },
      )

      await waitFor(() => {
        expect(result.current.data?.userId).toBe('1')
      })

      rerender({ userId: '2' })

      await waitFor(() => {
        expect(result.current.data?.userId).toBe('2')
      })
      expect(log.constructed).toBe(2)
    })

    it('should resolve again when the args of an already resolved instance change', async () => {
      const { UserToken } = defineUser()

      // Both instances exist before the hook mounts, so it reads them synchronously
      await container.get(UserToken, { userId: '1' })
      await container.get(UserToken, { userId: '2' })

      const { result, rerender } = renderHook(
        ({ userId }: { userId: string }) => {
          const args = useMemo(() => ({ userId }), [userId])
          return useService(UserToken, args)
        },
        { wrapper: createWrapper(), initialProps: { userId: '1' } },
      )

      expect(result.current.data?.userId).toBe('1')

      rerender({ userId: '2' })
      await waitFor(() => {
        expect(result.current.data?.userId).toBe('2')
      })

      rerender({ userId: '1' })
      await waitFor(() => {
        expect(result.current.data?.userId).toBe('1')
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

      const { result } = renderHook(() => useService(Dependent), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })
      expect(log).toEqual({ dependency: 1, dependent: 1 })

      await act(async () => {
        await container.invalidate(result.current.data!.dependency)
      })

      await waitFor(() => {
        expect(result.current.data?.dependency.id).toBe(2)
      })
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20))
      })

      // One new dependency, one new dependent: no constructor run is thrown away
      expect(log).toEqual({ dependency: 2, dependent: 2 })
      expect(result.current.data?.id).toBe(2)
      expect(result.current.isSuccess).toBe(true)
    })

    it('should initialise a dependent once when its dependency is destroyed asynchronously', async () => {
      const log = { dependency: 0, initialised: 0, destroyed: 0 }

      @Injectable()
      class Dependency {
        readonly id = ++log.dependency

        async onServiceDestroy() {
          await new Promise((resolve) => setTimeout(resolve, 5))
        }
      }

      @Injectable()
      class Dependent {
        readonly dependency = inject(Dependency)

        onServiceInit() {
          log.initialised++
        }

        onServiceDestroy() {
          log.destroyed++
        }
      }

      const { result } = renderHook(() => useService(Dependent), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      await act(async () => {
        await container.invalidate(result.current.data!.dependency)
      })

      await waitFor(() => {
        expect(result.current.data?.dependency.id).toBe(2)
      })
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20))
      })

      // The engine may run the constructor more than once while the old
      // dependency is still being destroyed, but only one instance is kept.
      expect(log).toEqual({ dependency: 2, initialised: 2, destroyed: 1 })
      expect(result.current.isSuccess).toBe(true)
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
      }

      const { result } = renderHook(() => useService(InvalidatableService), {
        wrapper: createWrapper(),
      })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data?.instanceId).toBe(1)

      // Invalidate the service
      await act(async () => {
        await container.invalidate(result.current.data)
      })

      // Wait for re-fetch with increased timeout for event propagation
      await waitFor(
        () => {
          expect(result.current.data?.instanceId).toBe(2)
        },
        { timeout: 2000 },
      )
    })
  })
})
