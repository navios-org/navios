import { Container, Injectable } from '@navios/di'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ClassType } from '@navios/di'

import { currentContext, enableAsyncContext } from '../execution/async-context.mjs'
import { handlerChain } from '../metadata/handler-chain.mjs'
import { executeChain, resolveChain, runChain } from '../metadata/run-chain.mjs'

import type { ExecutionContext } from '../execution/execution-context.mjs'
import type { Guard } from '../guards/guard.mjs'
import type { Interceptor } from '../interceptors/interceptor.mjs'

import { fakeContext } from './fake-context.mjs'

class App {}
class G1 {}
class G2 {}
class G3 {}
class I1 {}
class I2 {}
class I3 {}
class M {}
class C {}

const Tier = Symbol.for('test.chain.Tier')

const node = (guards: ClassType[] = [], interceptors: ClassType[] = []) => ({
  module: M,
  guards,
  interceptors,
  attributes: new Map<symbol, unknown>(),
  disputed: new Map<symbol, string>(),
})

/** Where the handler is. */
const at = { controller: C, handlerName: 'run' }

const extras = (guards: ClassType[] = [], interceptors: ClassType[] = []) => ({
  guards,
  interceptors,
  attributes: new Map<symbol, unknown>(),
})

describe('handlerChain', () => {
  it('orders the chain and removes duplicates', () => {
    const given = node([G1], [I1])
    const owner = extras([G2, G1], [I2])
    const member = extras([G3], [App, I3])

    expect(handlerChain({ application: [App], node: given, owner, member, ...at })).toEqual({
      info: {
        module: M,
        controller: C,
        handlerName: 'run',
        guards: [G1, G2, G3],
        interceptors: [App, I1, I2, I3],
        attributes: {
          handler: member.attributes,
          controller: owner.attributes,
          module: given.attributes,
        },
      },
      outer: [App],
      inner: [I1, I2, I3],
    })
  })

  it('keeps an interceptor of both kinds outside the guards', () => {
    const { outer, inner } = handlerChain({
      application: [App, App],
      node: node([], [I1, App]),
      owner: extras([], [I1]),
      member: extras(),
      ...at,
    })

    expect(outer).toEqual([App])
    expect(inner).toEqual([I1])
  })

  it('returns new arrays', () => {
    const given = node([G1])
    const chain = handlerChain({
      application: [],
      node: given,
      owner: extras(),
      member: extras(),
      ...at,
    })

    expect(chain.info.guards).toEqual([G1])
    expect(chain.info.guards).not.toBe(given.guards)
  })

  it('refuses a handler that would inherit a disputed attribute', () => {
    const given = node()
    given.disputed.set(Tier, 'one over A -> M, none over B -> M')
    const owner = extras()
    const member = extras()
    const chain = () => handlerChain({ application: [], node: given, owner, member, ...at })

    expect(chain).toThrow(
      '[Navios] Module M inherits different values of the attribute Symbol(test.chain.Tier): ' +
        'one over A -> M, none over B -> M. Set it on the controllers or handlers it is meant ' +
        'for, or on M itself.',
    )

    owner.attributes.set(Tier, 'own')
    expect(chain).not.toThrow()

    owner.attributes.clear()
    member.attributes.set(Tier, 'own')
    expect(chain).not.toThrow()
  })
})

describe('resolveChain and runChain', () => {
  const log: string[] = []
  let container: Container
  let ctx: ExecutionContext

  beforeEach(() => {
    log.length = 0
    container = new Container()
    ctx = fakeContext(container)
  })

  afterEach(async () => {
    await container.dispose()
  })

  function around(name: string) {
    @Injectable()
    class Around implements Interceptor {
      async intercept(_ctx: ExecutionContext, next: () => Promise<unknown>) {
        log.push(`${name}:enter`)
        try {
          return await next()
        } finally {
          log.push(`${name}:exit`)
        }
      }
    }
    return Around
  }

  function guard(name: string, allowed: boolean | Promise<boolean> = true) {
    @Injectable()
    class Checked implements Guard {
      canActivate() {
        log.push(name)
        return allowed
      }
    }
    return Checked
  }

  const handler = () => {
    log.push('handler')
    return 'result'
  }

  it('runs the application interceptors around the guards, and those around the rest', async () => {
    const chain = await resolveChain(
      container,
      handlerChain({
        application: [around('app')],
        node: node([guard('module')], [around('moduleInterceptor')]),
        owner: extras([guard('owner', Promise.resolve(true))], [around('inner')]),
        member: extras([guard('member')], [around('member')]),
        ...at,
      }),
    )

    await expect(runChain(ctx, chain, handler, vi.fn())).resolves.toBe('result')

    expect(log).toEqual([
      'app:enter',
      'module',
      'owner',
      'member',
      'moduleInterceptor:enter',
      'inner:enter',
      'member:enter',
      'handler',
      'member:exit',
      'inner:exit',
      'moduleInterceptor:exit',
      'app:exit',
    ])
  })

  it('asks onDenied what becomes of a denied execution, inside the outer interceptors', async () => {
    const Denying = guard('denying', Promise.resolve(false))
    const chain = await resolveChain(
      container,
      handlerChain({
        application: [around('app')],
        node: node(),
        owner: extras([Denying, guard('later')], [around('inner')]),
        member: extras(),
        ...at,
      }),
    )
    const onDenied = vi.fn(() => 'denied')

    await expect(runChain(ctx, chain, handler, onDenied)).resolves.toBe('denied')

    expect(onDenied).toHaveBeenCalledWith(Denying)
    expect(log).toEqual(['app:enter', 'denying', 'app:exit'])
  })

  it.each(['yes', 1, {}, null, 0, ''])('takes %j from a guard for a refusal', async (result) => {
    for (const given of [result, Promise.resolve(result)]) {
      const chain = await resolveChain(container, {
        info: { guards: [guard('loose', given as boolean | Promise<boolean>)] },
        outer: [],
        inner: [],
      })

      await expect(runChain(ctx, chain, handler, () => 'denied')).resolves.toBe('denied')
    }
    expect(log).not.toContain('handler')
  })

  it('rejects with what is thrown on the way', async () => {
    const chain = await resolveChain(
      container,
      handlerChain({
        application: [around('app')],
        node: node(),
        owner: extras([guard('denying', false)]),
        member: extras(),
        ...at,
      }),
    )
    const deny = () => {
      throw new Error('denied')
    }

    await expect(runChain(ctx, chain, handler, deny)).rejects.toThrow('denied')
    expect(log).toEqual(['app:enter', 'denying', 'app:exit'])
  })

  it('runs a handler with nothing around it', async () => {
    const chain = await resolveChain(
      container,
      handlerChain({ application: [], node: node(), owner: extras(), member: extras(), ...at }),
    )

    await expect(runChain(ctx, chain, handler, vi.fn())).resolves.toBe('result')
  })

  it('refuses a class that cannot do what it is listed for', async () => {
    @Injectable()
    class Neither {}

    await expect(
      resolveChain(container, { info: { guards: [Neither] }, outer: [], inner: [] }),
    ).rejects.toThrow('[Navios] Guard Neither does not implement canActivate()')
    await expect(
      resolveChain(container, { info: { guards: [] }, outer: [Neither], inner: [] }),
    ).rejects.toThrow('[Navios] Interceptor Neither does not implement intercept()')
    await expect(
      resolveChain(container, { info: { guards: [] }, outer: [], inner: [Neither] }),
    ).rejects.toThrow('[Navios] Interceptor Neither does not implement intercept()')
  })
})

describe('executeChain', () => {
  let container: Container

  beforeEach(() => {
    container = new Container()
  })

  afterEach(async () => {
    await container.dispose()
  })

  const bare = () =>
    resolveChain(
      container,
      handlerChain({ application: [], node: node(), owner: extras(), member: extras(), ...at }),
    )

  it('finishes the context after the handler, whatever the outcome', async () => {
    const chain = await bare()
    const done = fakeContext(container)
    const failed = fakeContext(container)
    const finished = vi.fn()
    done.onFinish(() => finished('done'))
    failed.onFinish(() => finished('failed'))
    const fail = () => {
      throw new Error('failed')
    }

    await expect(
      executeChain({ asyncContext: false }, done, chain, () => 'result', vi.fn()),
    ).resolves.toBe('result')
    await expect(
      executeChain({ asyncContext: false }, failed, chain, fail, vi.fn()),
    ).rejects.toThrow('failed')

    expect(finished.mock.calls).toEqual([['done'], ['failed']])
  })

  it('runs in the async context, finishing included, when the application keeps one', async () => {
    await enableAsyncContext()
    const chain = await bare()
    const kept = fakeContext(container)
    const notKept = fakeContext(container)
    const seen: unknown[] = []
    kept.onFinish(() => {
      seen.push(currentContext())
    })

    await executeChain(
      { asyncContext: true },
      kept,
      chain,
      () => seen.push(currentContext()),
      vi.fn(),
    )
    await executeChain(
      { asyncContext: false },
      notKept,
      chain,
      () => seen.push(currentContext()),
      vi.fn(),
    )

    expect(seen).toEqual([kept, kept, undefined])
  })
})
