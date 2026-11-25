import { Container, Injectable, InjectableScope } from '@navios/di'
import { act, Activity, createElement, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ScopedContainer } from '@navios/di'
import type { ReactNode } from 'react'
import type { Root } from 'react-dom/client'

import { ContainerProvider } from '../../container/container-provider.mjs'
import { useService } from '../../service/use-service.mjs'
import { ScopeProvider } from '../scope-provider.mjs'
import { useScopedContainer } from '../use-scope.mjs'

// testing-library's render does not replay effects under StrictMode, so these
// tests drive a real root: that is where React simulates unmount + re-mount.
describe('ScopeProvider lifecycle (createRoot)', () => {
  let container: Container
  let host: HTMLElement
  let root: Root
  let created: ScopedContainer[]
  let previousActEnvironment: unknown

  const flush = () => act(async () => {})

  const isDisposed = (scope: ScopedContainer) => {
    try {
      scope.getSync(Container)
      return false
    } catch {
      return true
    }
  }

  beforeEach(() => {
    previousActEnvironment = (globalThis as any).IS_REACT_ACT_ENVIRONMENT
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
    expect(process.env.NODE_ENV).not.toBe('production')

    container = new Container()
    created = []
    const createScope = container.createScope.bind(container)
    vi.spyOn(container, 'createScope').mockImplementation((metadata) => {
      const scope = createScope(metadata)
      created.push(scope)
      return scope
    })

    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => {
      root.unmount()
    })
    host.remove()
    await container.dispose()
    vi.restoreAllMocks()
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = previousActEnvironment
  })

  const tree = (children: ReactNode, strict: boolean) => {
    const app = createElement(ContainerProvider, { container, children })
    return strict ? createElement(StrictMode, null, app) : app
  }

  const scopeProvider = (props: Record<string, unknown> | null, ...children: ReactNode[]) =>
    createElement(ScopeProvider, props as any, ...children)

  function defineDraft() {
    const log = { constructed: 0, destroyed: 0 }

    @Injectable({ scope: InjectableScope.Request })
    class Draft {
      readonly id = ++log.constructed

      onServiceDestroy() {
        log.destroyed++
      }
    }

    function Show({ testId }: { testId: string }) {
      const { data, error } = useService(Draft)
      return createElement(
        'span',
        { 'data-testid': testId },
        error ? `error: ${error.message}` : data ? `draft ${data.id}` : 'loading',
      )
    }

    return { log, Show }
  }

  const text = (testId: string) => host.querySelector(`[data-testid="${testId}"]`)?.textContent

  describe.each([
    ['without StrictMode', false],
    ['under StrictMode', true],
  ])('%s', (_name, strict) => {
    it('resolves request-scoped services and shares them within the scope', async () => {
      const { log, Show } = defineDraft()

      await act(async () => {
        root.render(
          tree(
            scopeProvider(
              null,
              createElement(Show, { key: 'a', testId: 'a' }),
              createElement(Show, { key: 'b', testId: 'b' }),
            ),
            strict,
          ),
        )
      })
      await flush()

      expect(text('a')).toBe('draft 1')
      expect(text('b')).toBe('draft 1')
      expect(log.constructed).toBe(1)
      expect(log.destroyed).toBe(0)
    })

    it('keeps the scope usable after mount', async () => {
      let scope: ScopedContainer | null = null

      function Probe() {
        scope = useScopedContainer()
        return null
      }

      await act(async () => {
        root.render(tree(scopeProvider(null, createElement(Probe)), strict))
      })
      await flush()

      expect(scope).not.toBeNull()
      expect(isDisposed(scope!)).toBe(false)
    })

    it('disposes the scope on a real unmount', async () => {
      const { log, Show } = defineDraft()

      await act(async () => {
        root.render(tree(scopeProvider(null, createElement(Show, { testId: 'a' })), strict))
      })
      await flush()
      expect(text('a')).toBe('draft 1')

      await act(async () => {
        root.render(tree(null, strict))
      })
      await flush()

      expect(log.destroyed).toBe(1)
      expect(created.length).toBeGreaterThan(0)
      expect(created.every(isDisposed)).toBe(true)
    })

    it('disposes the scope and creates a new one when the key changes', async () => {
      const { log, Show } = defineDraft()

      const render = (key: string) =>
        act(async () => {
          root.render(tree(scopeProvider({ key }, createElement(Show, { testId: 'a' })), strict))
        })

      await render('one')
      await flush()
      expect(text('a')).toBe('draft 1')
      const first = [...created]

      await render('two')
      await flush()

      expect(text('a')).toBe('draft 2')
      expect(log.destroyed).toBe(1)
      expect(first.every(isDisposed)).toBe(true)
      expect(created.filter((scope) => !isDisposed(scope))).toHaveLength(1)
    })

    it('leaves no live scope behind after mounting and unmounting several times', async () => {
      const { log, Show } = defineDraft()

      for (let i = 0; i < 3; i++) {
        await act(async () => {
          root.render(tree(scopeProvider(null, createElement(Show, { testId: 'a' })), strict))
        })
        await flush()
        expect(text('a')).toBe(`draft ${i + 1}`)

        await act(async () => {
          root.render(tree(null, strict))
        })
        await flush()
      }

      expect(log.constructed).toBe(3)
      expect(log.destroyed).toBe(3)
      expect(created.every(isDisposed)).toBe(true)
    })

    it('gets a fresh scope when an Activity hides and shows the provider again', async () => {
      const { log, Show } = defineDraft()

      const render = (mode: 'visible' | 'hidden') =>
        act(async () => {
          root.render(
            tree(
              createElement(Activity, {
                mode,
                children: scopeProvider(null, createElement(Show, { testId: 'a' })),
              }),
              strict,
            ),
          )
        })

      await render('visible')
      await flush()
      expect(text('a')).toBe('draft 1')

      await render('hidden')
      await flush()
      expect(log.destroyed).toBe(1)
      expect(created.every(isDisposed)).toBe(true)

      await render('visible')
      await flush()
      expect(text('a')).toBe('draft 2')
      expect(created.filter((scope) => !isDisposed(scope))).toHaveLength(1)
    })
  })
})
