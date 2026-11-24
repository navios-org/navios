import { Container, Injectable, InjectableScope } from '@navios/di'
import { act, Activity, createElement, StrictMode, Suspense, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ScopedContainer } from '@navios/di'
import type { ReactNode } from 'react'
import type { Root } from 'react-dom/client'

import { useScope } from '../../hooks/use-scope.mjs'
import { useSuspenseService } from '../../hooks/use-suspense-service.mjs'
import { ContainerProvider } from '../container-provider.mjs'
import { ScopeProvider } from '../scope-provider.mjs'

// A `<Suspense>` boundary outside a `<ScopeProvider>`: while a child suspends
// on its first mount, React throws the provider away and mounts it again on
// every retry. These tests drive a real root, as the lifecycle spec does.
describe('ScopeProvider under an outer Suspense boundary (createRoot)', () => {
  // A retry loop must fail the test, not exhaust memory.
  const RENDER_CAP = 40

  let container: Container
  let host: HTMLElement
  let root: Root
  let created: ScopedContainer[]
  let previousActEnvironment: unknown

  const flush = () => act(async () => {})
  const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))
  const settle = async (ms = 20) => {
    await act(async () => {
      await wait(ms)
    })
    await flush()
  }

  const isDisposed = (scope: ScopedContainer) => {
    try {
      scope.getSync(Container)
      return false
    } catch {
      return true
    }
  }
  const live = () => created.filter((scope) => !isDisposed(scope))

  beforeEach(() => {
    previousActEnvironment = (globalThis as any).IS_REACT_ACT_ENVIRONMENT
    ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true

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

  const suspense = (testId: string, ...children: ReactNode[]) =>
    createElement(
      Suspense,
      { fallback: createElement('i', { 'data-testid': `${testId}-fallback` }, 'loading') },
      ...children,
    )

  /** A request-scoped service that takes `delay` ms to initialise. */
  function defineDraft(delay = 5) {
    const log = { constructed: 0, destroyed: 0, renders: 0 }

    @Injectable({ scope: InjectableScope.Request })
    class Draft {
      readonly id = ++log.constructed

      async onServiceInit() {
        await wait(delay)
      }

      onServiceDestroy() {
        log.destroyed++
      }
    }

    function Show({ testId }: { testId: string }) {
      const scopeId = useScope()
      if (++log.renders > RENDER_CAP) {
        return createElement('span', { 'data-testid': testId }, 'render loop')
      }
      const draft = useSuspenseService(Draft)
      return createElement(
        'span',
        { 'data-testid': testId, 'data-scope': scopeId },
        `draft ${draft.id}`,
      )
    }

    return { log, Show, Draft }
  }

  const text = (testId: string) => host.querySelector(`[data-testid="${testId}"]`)?.textContent
  const scopeAttr = (testId: string) =>
    host.querySelector(`[data-testid="${testId}"]`)?.getAttribute('data-scope')

  describe.each([
    ['without StrictMode', false],
    ['under StrictMode', true],
  ])('%s', (_name, strict) => {
    it('settles with one scope and one construction', async () => {
      const { log, Show } = defineDraft()

      await act(async () => {
        root.render(
          tree(suspense('s', scopeProvider(null, createElement(Show, { testId: 'a' }))), strict),
        )
      })
      expect(text('s-fallback')).toBe('loading')
      await settle()

      expect(text('a')).toBe('draft 1')
      expect(text('s-fallback')).toBeUndefined()
      expect(log.constructed).toBe(1)
      expect(log.destroyed).toBe(0)
      expect(live()).toHaveLength(1)
      // The scope id the children see is the id of the scope they resolve from.
      expect(scopeAttr('a')).toBe(live()[0].getMetadata('scopeId'))
    })

    it('settles when a component between the boundary and the provider renders again', async () => {
      const { log, Show } = defineDraft()

      // `Page` runs again on every attempt, so the provider element, its
      // props and its metadata object are new each time.
      function Page() {
        return scopeProvider(
          { metadata: { page: { id: 7 } } },
          createElement(Show, { testId: 'a' }),
        )
      }

      const render = (children: ReactNode) =>
        act(async () => {
          root.render(tree(children, strict))
        })

      await render([createElement('div', { key: 'page' }, suspense('s', createElement(Page)))])
      await settle()

      expect(text('a')).toMatch(/^draft [12]$/)
      expect(live().filter((scope) => scope.getMetadata('page') !== undefined)).not.toHaveLength(0)
      expect(scopeAttr('a')).toBeTruthy()
      // `act` runs React's second attempt in the same synchronous stretch as
      // the first, where the provider cannot tell a retry from a sibling: it
      // may start a second scope. With React's scheduler it does not (below).
      expect(log.constructed).toBeLessThanOrEqual(2)

      // The scope that lost is disposed by the commits that follow.
      for (const key of ['x', 'y']) {
        await render([
          createElement('div', { key: 'page' }, suspense('s', createElement(Page))),
          scopeProvider({ key, scopeId: key }, null),
        ])
        await flush()
      }
      expect(log.destroyed).toBe(log.constructed - 1)
      expect(live().filter((scope) => scope.getMetadata('page') !== undefined)).toHaveLength(1)
    })

    it('settles with one construction under the React scheduler', async () => {
      const { log, Show } = defineDraft()

      function Page() {
        return scopeProvider(
          { metadata: { page: { id: 7 } } },
          createElement(Show, { testId: 'a' }),
        )
      }

      // No `act`: React schedules its attempts as it does in an application.
      ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false
      try {
        root.render(tree(suspense('s', createElement(Page)), strict))
        for (let i = 0; i < 200 && text('a') === undefined; i++) {
          await wait(5)
        }
        await wait(20)
      } finally {
        ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
      }

      expect(text('a')).toBe('draft 1')
      expect(log.constructed).toBe(1)
      expect(log.destroyed).toBe(0)
      expect(created).toHaveLength(1)
      expect(live()).toHaveLength(1)
    })

    it('keeps one scope when the boundary renders again while it is suspended', async () => {
      const { log, Show } = defineDraft(30)
      let bump: () => void = () => {}

      function Page() {
        const [count, setCount] = useState(0)
        bump = () => setCount((value) => value + 1)
        return suspense(
          's',
          createElement('b', { 'data-testid': 'count' }, String(count)),
          scopeProvider(null, createElement(Show, { testId: 'a' })),
        )
      }

      await act(async () => {
        root.render(tree(createElement(Page), strict))
      })
      for (let i = 0; i < 3; i++) {
        await act(async () => {
          bump()
        })
      }
      expect(text('s-fallback')).toBe('loading')
      await settle(60)

      expect(text('a')).toBe('draft 1')
      expect(text('count')).toBe('3')
      expect(log.constructed).toBe(1)
      expect(live()).toHaveLength(1)
    })

    it('disposes the scope on unmount and on a key change', async () => {
      const { log, Show } = defineDraft()

      const render = (key: string | null) =>
        act(async () => {
          root.render(
            tree(
              key === null
                ? null
                : suspense('s', scopeProvider({ key }, createElement(Show, { testId: 'a' }))),
              strict,
            ),
          )
        })

      await render('one')
      await settle()
      expect(text('a')).toBe('draft 1')

      await render('two')
      await settle()
      expect(text('a')).toBe('draft 2')
      expect(log.destroyed).toBe(1)
      expect(live()).toHaveLength(1)

      await render(null)
      await settle()
      expect(log.constructed).toBe(2)
      expect(log.destroyed).toBe(2)
      expect(created.every(isDisposed)).toBe(true)
    })

    it('gives sibling providers under one boundary a scope each', async () => {
      const { log, Show } = defineDraft()

      await act(async () => {
        root.render(
          tree(
            suspense(
              's',
              scopeProvider({ key: 'a' }, createElement(Show, { testId: 'a' })),
              scopeProvider({ key: 'b' }, createElement(Show, { testId: 'b' })),
              scopeProvider({ key: 'c', scopeId: 'named' }, createElement(Show, { testId: 'c' })),
            ),
            strict,
          ),
        )
      })
      await settle(40)

      const drafts = [text('a'), text('b'), text('c')]
      expect(new Set(drafts).size).toBe(3)
      expect(drafts.every((value) => /^draft \d+$/.test(value ?? ''))).toBe(true)
      expect(new Set([scopeAttr('a'), scopeAttr('b'), scopeAttr('c')]).size).toBe(3)
      expect(scopeAttr('c')).toBe('named')
      expect(log.constructed).toBe(3)
      expect(log.destroyed).toBe(0)
      expect(live()).toHaveLength(3)
    })

    it('keeps nested providers independent', async () => {
      const { log, Show } = defineDraft()

      await act(async () => {
        root.render(
          tree(
            suspense(
              's',
              scopeProvider(
                null,
                createElement(Show, { key: 'outer', testId: 'outer' }),
                scopeProvider({ key: 'inner' }, createElement(Show, { testId: 'inner' })),
              ),
            ),
            strict,
          ),
        )
      })
      await settle(40)

      expect(new Set([text('outer'), text('inner')])).toEqual(new Set(['draft 1', 'draft 2']))
      expect(scopeAttr('outer')).not.toBe(scopeAttr('inner'))
      expect(log.constructed).toBe(2)
      expect(live()).toHaveLength(2)
    })

    it('settles each boundary on its own when the services take different times', async () => {
      const fast = defineDraft(5)
      const slow = defineDraft(60)

      await act(async () => {
        root.render(
          tree(
            [
              suspense('f', scopeProvider({ key: 'f' }, createElement(fast.Show, { testId: 'f' }))),
              suspense('s', scopeProvider({ key: 's' }, createElement(slow.Show, { testId: 's' }))),
            ].map((element, index) => createElement('div', { key: index }, element)),
            strict,
          ),
        )
      })
      await settle(25)
      expect(text('f')).toBe('draft 1')
      expect(text('s-fallback')).toBe('loading')

      await settle(80)
      expect(text('s')).toBe('draft 1')
      expect(fast.log.constructed).toBe(1)
      expect(slow.log.constructed).toBe(1)
      expect(fast.log.destroyed + slow.log.destroyed).toBe(0)
      expect(live()).toHaveLength(2)
    })

    it('disposes a scope whose render never commits', async () => {
      const { log, Show } = defineDraft(30)

      const render = (children: ReactNode) =>
        act(async () => {
          root.render(tree(children, strict))
        })

      // The boundary goes away while the service is still initialising.
      await render(
        suspense('s', scopeProvider({ key: 'gone' }, createElement(Show, { testId: 'a' }))),
      )
      expect(text('s-fallback')).toBe('loading')
      await render(null)
      await settle(60)
      expect(log.constructed).toBe(1)

      // Later providers commit and unmount; the abandoned scope goes with them.
      for (const key of ['x', 'y']) {
        await render(scopeProvider({ key, scopeId: key }, null))
        await flush()
      }
      await render(null)
      await flush()

      expect(log.destroyed).toBe(1)
      expect(created.every(isDisposed)).toBe(true)
    })

    it('disposes scopes that never commit when the ContainerProvider unmounts', async () => {
      const { log, Show } = defineDraft(30)

      await act(async () => {
        root.render(
          tree(suspense('s', scopeProvider(null, createElement(Show, { testId: 'a' }))), strict),
        )
      })
      expect(text('s-fallback')).toBe('loading')

      await act(async () => {
        root.render(null)
      })
      await settle(60)

      expect(log.constructed).toBe(1)
      expect(log.destroyed).toBe(1)
      expect(created.every(isDisposed)).toBe(true)
    })

    it('keeps sibling providers apart when each has its boundary inside', async () => {
      const { log, Show } = defineDraft()
      let mounts = 0

      function Row({ testId }: { testId: string }) {
        useState(() => ++mounts)
        return suspense(testId, createElement(Show, { testId }))
      }

      await act(async () => {
        root.render(
          tree(
            ['a', 'b', 'c'].map((testId) =>
              scopeProvider({ key: testId }, createElement(Row, { testId })),
            ),
            strict,
          ),
        )
      })
      expect(created).toHaveLength(3)
      await settle(40)

      expect(new Set([text('a'), text('b'), text('c')])).toEqual(
        new Set(['draft 1', 'draft 2', 'draft 3']),
      )
      expect(log.constructed).toBe(3)
      expect(log.destroyed).toBe(0)
      expect(created).toHaveLength(3)
      expect(live()).toHaveLength(3)
      // No provider had to start its children over.
      expect(mounts).toBe(strict ? 6 : 3)
    })

    it('separates two providers that committed with the same pending scope', async () => {
      const { log, Show } = defineDraft()

      // One element used at two positions: the providers get the same props
      // object, the one case in which the second takes the first one's scope
      // in the same synchronous render, while the first is still alive.
      const element = scopeProvider(null, suspense('s', createElement(Show, { testId: 'a' })))
      const shown = () => [...host.querySelectorAll('[data-testid="a"]')]

      // No `act`: inside `act`, React itself spins when a suspended boundary
      // is remounted from a layout effect next to another suspended one.
      ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false
      try {
        root.render(
          tree(
            [createElement('div', { key: 1 }, element), createElement('div', { key: 2 }, element)],
            strict,
          ),
        )
        for (let i = 0; i < 200 && shown().length < 2; i++) {
          await wait(5)
        }
        await wait(20)
      } finally {
        ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
      }

      expect(
        shown()
          .map((node) => node.textContent)
          .sort(),
      ).toEqual(['draft 1', 'draft 2'])
      expect(new Set(shown().map((node) => node.getAttribute('data-scope'))).size).toBe(2)
      expect(log.constructed).toBe(2)
      expect(log.destroyed).toBe(0)
      expect(created).toHaveLength(2)
      expect(live()).toHaveLength(2)

      await act(async () => {
        root.render(tree(null, strict))
      })
      await settle()
      expect(log.destroyed).toBe(2)
      expect(created.every(isDisposed)).toBe(true)
    })

    it('starts a scope for a provider first rendered inside a hidden Activity', async () => {
      const { log, Show } = defineDraft()

      const render = (mode: 'visible' | 'hidden', extra: ReactNode = null) =>
        act(async () => {
          root.render(
            tree(
              [
                createElement(Activity, {
                  key: 'activity',
                  mode,
                  children: suspense(
                    's',
                    scopeProvider(null, createElement(Show, { testId: 'a' })),
                  ),
                }),
                extra,
              ],
              strict,
            ),
          )
        })

      // A hidden tree is rendered without effects: its provider has not
      // committed, and the commits that follow dispose its scope.
      await render('hidden')
      await settle()
      for (const key of ['x', 'y', 'z']) {
        await render('hidden', scopeProvider({ key, scopeId: key }, null))
        await flush()
      }

      await render('visible')
      await settle()

      expect(text('a')).toMatch(/^draft \d+$/)
      const visible = live().filter((scope) => scope.getMetadata('scopeId') === scopeAttr('a'))
      expect(visible).toHaveLength(1)

      await act(async () => {
        root.render(tree(null, strict))
      })
      await settle()
      expect(log.destroyed).toBe(log.constructed)
      expect(created.every(isDisposed)).toBe(true)
    })

    it('disposes scopes of renders thrown away for another reason', async () => {
      const { log, Show } = defineDraft()
      let release: () => void = () => {}
      const gate = new Promise<void>((resolve) => {
        release = resolve
      })
      let open = false
      void gate.then(() => {
        open = true
      })

      // Suspends on something the DI hooks know nothing about.
      function Gate() {
        if (!open) {
          throw gate
        }
        return null
      }

      await act(async () => {
        root.render(
          tree(
            suspense(
              's',
              scopeProvider(null, createElement(Show, { testId: 'a' })),
              createElement(Gate),
            ),
            strict,
          ),
        )
      })
      await settle()
      expect(text('s-fallback')).toBe('loading')

      await act(async () => {
        release()
      })
      await settle()
      expect(text('a')).toMatch(/^draft \d+$/)
      expect(live()).toHaveLength(1)

      await act(async () => {
        root.render(null)
      })
      await settle()
      expect(log.destroyed).toBe(log.constructed)
      expect(created.every(isDisposed)).toBe(true)
    })
  })
})
