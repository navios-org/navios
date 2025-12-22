import { Container, Injectable, InjectionToken, Registry } from '@navios/di'

import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement, useMemo } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import { ContainerProvider } from '../../providers/container-provider.mjs'
import { useService } from '../use-service.mjs'

describe('useService', () => {
  let container: Container
  let registry: Registry

  beforeEach(() => {
    registry = new Registry()
    container = new Container(registry)
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
      @Injectable({ registry })
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
      @Injectable({ registry })
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

      expect(result.current.error?.message).toContain(
        'Service initialization failed',
      )
      expect(result.current.data).toBeUndefined()
      expect(result.current.isLoading).toBe(false)
      expect(result.current.isSuccess).toBe(false)
    })

    it('should refetch service when refetch is called', async () => {
      let callCount = 0

      @Injectable({ registry })
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

      @Injectable({ registry, token: TestToken })
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
      const UserToken = InjectionToken.create<
        { userId: string; name: string },
        typeof UserSchema
      >('User', UserSchema)

      @Injectable({ registry, token: UserToken })
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

  describe('service invalidation', () => {
    it('should re-fetch when service is invalidated', async () => {
      let instanceCount = 0

      @Injectable({ registry })
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
