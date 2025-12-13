import { Container, Injectable, InjectionToken, Registry } from '@navios/di'

import { act, render, screen, waitFor } from '@testing-library/react'
import { createElement, useMemo } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import { ContainerProvider } from '../../providers/container-provider.mjs'
import { useInvalidate, useInvalidateInstance } from '../use-invalidate.mjs'
import { useService } from '../use-service.mjs'

describe('useInvalidate', () => {
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

  describe('with class tokens', () => {
    it('should invalidate a service and trigger re-fetch', async () => {
      let instanceCount = 0

      @Injectable({ registry })
      class CounterService {
        public readonly id: number

        constructor() {
          instanceCount++
          this.id = instanceCount
        }
      }

      let invalidateFn: (() => Promise<void>) | null = null

      function TestComponent() {
        const { data, isSuccess } = useService(CounterService)
        const invalidate = useInvalidate(CounterService)
        invalidateFn = invalidate

        if (!isSuccess) {
          return createElement('div', { 'data-testid': 'loading' }, 'Loading...')
        }

        return createElement('div', { 'data-testid': 'counter' }, String(data!.id))
      }

      render(createWrapper(createElement(TestComponent)))

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByTestId('counter')).toBeDefined()
      })

      expect(screen.getByTestId('counter').textContent).toBe('1')

      // Invalidate the service
      await act(async () => {
        await invalidateFn!()
      })

      // Wait for re-fetch
      await waitFor(() => {
        expect(screen.getByTestId('counter').textContent).toBe('2')
      })

      expect(instanceCount).toBe(2)
    })
  })

  describe('with injection tokens and args', () => {
    it('should invalidate a service with specific args', async () => {
      let instanceCount = 0
      const instances = new Map<string, number>()

      const UserSchema = z.object({ userId: z.string() })
      const UserToken = InjectionToken.create<
        { userId: string; instanceId: number },
        typeof UserSchema
      >('User', UserSchema)

      @Injectable({ registry, token: UserToken })
      class _UserService {
        public userId: string
        public instanceId: number

        constructor(args: z.infer<typeof UserSchema>) {
          this.userId = args.userId
          const currentCount = instances.get(args.userId) ?? 0
          instanceCount++
          this.instanceId = instanceCount
          instances.set(args.userId, this.instanceId)
        }
      }

      let invalidateUser1: (() => Promise<void>) | null = null

      function TestComponent() {
        const args1 = useMemo(() => ({ userId: 'user1' }), [])
        const args2 = useMemo(() => ({ userId: 'user2' }), [])

        const { data: user1, isSuccess: isSuccess1 } = useService(UserToken, args1)
        const { data: user2, isSuccess: isSuccess2 } = useService(UserToken, args2)
        const invalidate1 = useInvalidate(UserToken, args1)
        invalidateUser1 = invalidate1

        if (!isSuccess1 || !isSuccess2) {
          return createElement('div', { 'data-testid': 'loading' }, 'Loading...')
        }

        return createElement('div', null, [
          createElement('span', { key: '1', 'data-testid': 'user1' }, String(user1!.instanceId)),
          createElement('span', { key: '2', 'data-testid': 'user2' }, String(user2!.instanceId)),
        ])
      }

      render(createWrapper(createElement(TestComponent)))

      await waitFor(() => {
        expect(screen.getByTestId('user1')).toBeDefined()
        expect(screen.getByTestId('user2')).toBeDefined()
      })

      expect(screen.getByTestId('user1').textContent).toBe('1')
      expect(screen.getByTestId('user2').textContent).toBe('2')

      // Invalidate only user1
      await act(async () => {
        await invalidateUser1!()
      })

      // Wait for user1 to be re-fetched
      await waitFor(() => {
        expect(screen.getByTestId('user1').textContent).toBe('3')
      })

      // user2 should still be the same
      expect(screen.getByTestId('user2').textContent).toBe('2')
    })
  })
})

describe('useInvalidateInstance', () => {
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

  it('should invalidate a service instance directly', async () => {
    let instanceCount = 0

    @Injectable({ registry })
    class CounterService {
      public readonly id: number

      constructor() {
        instanceCount++
        this.id = instanceCount
      }
    }

    let invalidateInstanceFn: ((instance: unknown) => Promise<void>) | null = null
    let currentInstance: CounterService | undefined

    function TestComponent() {
      const { data, isSuccess } = useService(CounterService)
      const invalidateInstance = useInvalidateInstance()
      invalidateInstanceFn = invalidateInstance
      currentInstance = data

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

    // Invalidate the instance directly
    await act(async () => {
      await invalidateInstanceFn!(currentInstance!)
    })

    // Wait for re-fetch
    await waitFor(() => {
      expect(screen.getByTestId('counter').textContent).toBe('2')
    })
  })
})
