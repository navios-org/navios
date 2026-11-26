import { Container, DIError, DIErrorCode, Injectable, InjectionToken, provide } from '@navios/di'
import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import { ContainerProvider } from '../../container/container-provider.mjs'
import { useOptionalService } from '../use-optional-service.mjs'
import { useService } from '../use-service.mjs'

import type { UseServiceResult } from '../types.mjs'

// Behaviour useService and useOptionalService share.
describe.each([
  ['useService', useService],
  ['useOptionalService', useOptionalService as typeof useService],
])('%s', (_name, useHook) => {
  let container: Container

  beforeEach(() => {
    container = new Container()
  })

  afterEach(async () => {
    await container.dispose()
  })

  const wrapperFor =
    (target: Container) =>
    ({ children }: { children: React.ReactNode }) =>
      createElement(ContainerProvider, { container: target, children })

  const flags = ({ isLoading, isSuccess, isError }: UseServiceResult<unknown>) => ({
    isLoading,
    isSuccess,
    isError,
  })

  describe('first render', () => {
    it('should report loading when the container does not hold the instance', async () => {
      @Injectable()
      class Service {}

      const renders: ReturnType<typeof flags>[] = []
      const { result } = renderHook(
        () => {
          const service = useHook(Service)
          renders.push(flags(service))
          return service
        },
        { wrapper: wrapperFor(container) },
      )

      expect(renders[0]).toEqual({ isLoading: true, isSuccess: false, isError: false })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })
      // No render without a state
      expect(renders).not.toContainEqual({ isLoading: false, isSuccess: false, isError: false })
    })

    it('should return the instance the container already holds', async () => {
      @Injectable()
      class Service {}

      const instance = await container.get(Service)
      const renders: ReturnType<typeof flags>[] = []
      const { result } = renderHook(
        () => {
          const service = useHook(Service)
          renders.push(flags(service))
          return service
        },
        { wrapper: wrapperFor(container) },
      )

      expect(result.current.data).toBe(instance)
      expect(renders.every((render) => render.isSuccess)).toBe(true)
    })
  })

  describe('args change', () => {
    it('should keep the instance of the new args when the old resolution settles last', async () => {
      const UserSchema = z.object({ userId: z.string() })
      const UserToken = InjectionToken.create<{ userId: string }, typeof UserSchema>(
        'User',
        UserSchema,
      )
      const release = new Map<string, () => void>()

      @Injectable({ token: UserToken })
      class _UserService {
        readonly userId: string

        constructor(args: z.infer<typeof UserSchema>) {
          this.userId = args.userId
        }

        async onServiceInit() {
          await new Promise<void>((resolve) => release.set(this.userId, resolve))
        }
      }

      const { result, rerender } = renderHook(
        ({ userId }: { userId: string }) => useHook(UserToken, { userId }),
        { wrapper: wrapperFor(container), initialProps: { userId: '1' } },
      )

      await waitFor(() => {
        expect(release.has('1')).toBe(true)
      })
      rerender({ userId: '2' })
      await waitFor(() => {
        expect(release.has('2')).toBe(true)
      })

      await act(async () => {
        release.get('2')!()
        await container.get(UserToken, { userId: '2' })
      })
      await waitFor(() => {
        expect(result.current.data?.userId).toBe('2')
      })

      // The resolution for the old args finishes now
      await act(async () => {
        release.get('1')!()
        await container.get(UserToken, { userId: '1' })
        await new Promise((resolve) => setTimeout(resolve, 10))
      })

      expect(result.current.data?.userId).toBe('2')
      expect(result.current.isSuccess).toBe(true)
    })
  })

  describe('refetch', () => {
    it('should resolve again after a failure and follow the instance it got', async () => {
      let failing = true
      let built = 0

      @Injectable()
      class Flaky {
        readonly id: number

        constructor() {
          if (failing) {
            throw new Error('Not ready yet')
          }
          this.id = ++built
        }
      }

      const { result } = renderHook(() => useHook(Flaky), { wrapper: wrapperFor(container) })

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      })
      expect(result.current.error?.message).toContain('Not ready yet')

      failing = false
      await act(async () => {
        result.current.refetch()
      })
      await waitFor(() => {
        expect(result.current.data?.id).toBe(1)
      })

      // The instance refetch returned is subscribed to
      await act(async () => {
        await container.invalidate(result.current.data)
      })
      await waitFor(() => {
        expect(result.current.data?.id).toBe(2)
      })
    })

    it('should return the existing instance', async () => {
      @Injectable()
      class Service {}

      const { result } = renderHook(() => useHook(Service), { wrapper: wrapperFor(container) })

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })
      const instance = result.current.data

      await act(async () => {
        result.current.refetch()
      })
      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
      })

      expect(result.current.data).toBe(instance)
    })
  })

  describe('a token the container cannot read synchronously', () => {
    it('should report an alias cycle in error instead of throwing during render', async () => {
      const A = InjectionToken.create<string>('A')
      const B = InjectionToken.create<string>('B')
      const cyclic = new Container({
        providers: [provide(A, { existing: B }), provide(B, { existing: A })],
      })

      const { result } = renderHook(() => useHook(A), { wrapper: wrapperFor(cyclic) })

      await waitFor(() => {
        expect(result.current.isError).toBe(true)
      })
      expect(result.current.error).toBeInstanceOf(DIError)
      expect((result.current.error as DIError).code).toBe(DIErrorCode.CircularDependency)

      await cyclic.dispose()
    })
  })
})
