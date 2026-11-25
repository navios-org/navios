import { Container, Injectable } from '@navios/di'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ClassType } from '@navios/di'

import { handlerChain } from '../metadata/handler-chain.mjs'
import { resolveChain, runChain } from '../metadata/run-chain.mjs'

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

const Tier = Symbol.for('test.chain.Tier')

const node = (guards: ClassType[] = [], interceptors: ClassType[] = []) => ({
  module: M,
  guards,
  interceptors,
  disputed: new Map<symbol, string>(),
})

const extras = (guards: ClassType[] = [], interceptors: ClassType[] = []) => ({
  guards,
  interceptors,
  attributes: new Map<symbol, unknown>(),
})

describe('handlerChain', () => {
  it('orders the chain and removes duplicates', () => {
    expect(
      handlerChain({
        application: [App],
        node: node([G1], [I1]),
        owner: extras([G2, G1], [I2]),
        member: extras([G3], [App, I3]),
      }),
    ).toEqual({
      guards: [G1, G2, G3],
      interceptors: [App, I1, I2, I3],
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
    })

    chain.guards.push(G2)

    expect(given.guards).toEqual([G1])
  })

  it('refuses a handler that would inherit a disputed attribute', () => {
    const given = node()
    given.disputed.set(Tier, 'one over A -> M, none over B -> M')
    const owner = extras()
    const member = extras()
    const chain = () => handlerChain({ application: [], node: given, owner, member })

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
        outer: [],
        guards: [guard('loose', given as boolean | Promise<boolean>)],
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
      handlerChain({ application: [], node: node(), owner: extras(), member: extras() }),
    )

    await expect(runChain(ctx, chain, handler, vi.fn())).resolves.toBe('result')
  })

  it('refuses a class that cannot do what it is listed for', async () => {
    @Injectable()
    class Neither {}

    await expect(
      resolveChain(container, { guards: [Neither], outer: [], inner: [] }),
    ).rejects.toThrow('[Navios] Guard Neither does not implement canActivate()')
    await expect(
      resolveChain(container, { guards: [], outer: [Neither], inner: [] }),
    ).rejects.toThrow('[Navios] Interceptor Neither does not implement intercept()')
    await expect(
      resolveChain(container, { guards: [], outer: [], inner: [Neither] }),
    ).rejects.toThrow('[Navios] Interceptor Neither does not implement intercept()')
  })
})
