import { Container, Injectable, InjectionToken } from '@navios/di'
import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import { createElement, Suspense, useLayoutEffect, useRef } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import type { OnServiceInit } from '@navios/di'

import { ContainerProvider } from '../../container/container-provider.mjs'
import { useOptionalService } from '../use-optional-service.mjs'
import { useService } from '../use-service.mjs'
import { useSuspenseService } from '../use-suspense-service.mjs'

import type { ServiceHook } from '../types.mjs'

const hooks: [string, ServiceHook<'service' | 'optional'>][] = [
  ['useService', useService],
  ['useOptionalService', useOptionalService],
]

const tick = (ms = 1) => new Promise<void>((resolve) => setTimeout(resolve, ms))

describe('an invalidation the hook is not subscribed for yet', () => {
  let container: Container

  beforeEach(() => {
    container = new Container()
  })

  afterEach(async () => {
    await container.dispose()
  })

  const wrapper = ({ children }: { children: React.ReactNode }) =>
    createElement(ContainerProvider, { container, children })

  /** Invalidates `instance` once, after the render and before the effects. */
  function useInvalidateBeforeEffects(instance: unknown) {
    const done = useRef(false)
    useLayoutEffect(() => {
      if (!done.current) {
        done.current = true
        void container.invalidate(instance)
      }
    }, [instance])
  }

  describe.each(hooks)('%s', (_name, useHook) => {
    it('should not keep an instance destroyed between the render and the effect', async () => {
      @Injectable()
      class Service {}

      const first = await container.get(Service)
      const { result } = renderHook(
        () => {
          const service = useHook(Service)
          useInvalidateBeforeEffects(first)
          return service
        },
        { wrapper },
      )

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
        expect(result.current.data).not.toBe(first)
      })
      expect(result.current.data).toBe(container.peek(Service))
    })

    it('should not keep an instance destroyed right after it was resolved', async () => {
      @Injectable()
      class Service implements OnServiceInit {
        async onServiceInit() {
          await tick()
        }
      }

      // Asked for first, so this runs before the hook receives the instance.
      const invalidated = container
        .get(Service)
        .then((instance) => container.invalidate(instance).then(() => instance))
      const { result } = renderHook(() => useHook(Service), { wrapper })
      const first = await invalidated

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true)
        expect(result.current.data).not.toBe(first)
      })
      expect(result.current.data).toBe(container.peek(Service))
    })
  })

  describe('useSuspenseService', () => {
    const suspended = (child: React.ReactNode) =>
      createElement(ContainerProvider, {
        container,
        children: createElement(
          Suspense,
          { fallback: createElement('div', null, 'loading') },
          child,
        ),
      })

    it('should not keep an instance destroyed between the render and the effect', async () => {
      let created = 0

      @Injectable()
      class Service {
        readonly id = ++created
      }

      const first = await container.get(Service)

      function Shown() {
        const service = useSuspenseService(Service)
        useInvalidateBeforeEffects(first)
        return createElement('div', { 'data-testid': 'id' }, String(service.id))
      }

      render(suspended(createElement(Shown)))

      await waitFor(() => {
        expect(screen.getByTestId('id').textContent).toBe('2')
      })
      expect(container.peek(Service)?.id).toBe(2)
    })

    it('should drop the cache entries and listeners of args it no longer shows', async () => {
      const schema = z.object({ id: z.number() })

      const ITEM = InjectionToken.create<{ args: z.output<typeof schema> }, typeof schema>(
        'Item',
        schema,
      )

      @Injectable({ token: ITEM })
      class Item {
        constructor(readonly args: z.output<typeof schema>) {}
      }

      let listening = 0
      const onInvalidate = container.onInvalidate.bind(container) as (
        ...args: unknown[]
      ) => () => void
      container.onInvalidate = (...args: unknown[]) => {
        const stop = onInvalidate(...args)
        listening++
        return () => {
          listening--
          stop()
        }
      }

      function Shown({ id }: { id: number }) {
        const item = useSuspenseService(ITEM, { id })
        return createElement('div', { 'data-testid': 'id' }, String(item.args.id))
      }

      const view = render(suspended(createElement(Shown, { id: 1 })))
      for (let id = 1; id <= 5; id++) {
        view.rerender(suspended(createElement(Shown, { id })))
        await waitFor(() => {
          expect(screen.getByTestId('id').textContent).toBe(String(id))
        })
      }
      await act(() => tick(20))
      expect(listening).toBe(1)

      view.unmount()
      await act(() => tick(20))
      expect(listening).toBe(0)

      // What was dropped is resolved again, to the instance the container holds.
      const kept = await container.get(ITEM, { id: 3 })
      render(suspended(createElement(Shown, { id: 3 })))
      await waitFor(() => {
        expect(screen.getByTestId('id').textContent).toBe('3')
      })
      expect(container.peek(ITEM, { id: 3 })).toBe(kept)
      expect(kept).toBeInstanceOf(Item)
    })
  })
})
