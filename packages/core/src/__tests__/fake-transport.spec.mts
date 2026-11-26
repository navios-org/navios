import { afterEach, describe, expect, it } from 'vitest'

import { createApplication } from '../application/application.mjs'
import { AttributeFactory, currentContext, Injectable, UseGuards } from '../index.mjs'
import { UseInterceptors } from '../interceptors/use-interceptors.mjs'
import { AttributeFactory as LegacyAttributes } from '../legacy-compat/attribute-factory.mjs'
import { UseGuards as LegacyUseGuards } from '../legacy-compat/use-guards.mjs'
import { registerModule } from '../modules/module.mjs'
import { fakeTransport } from '../testing/index.mjs'

import type { Application } from '../application/application.mjs'
import type { ExecutionContext } from '../execution/execution-context.mjs'
import type { Guard } from '../guards/guard.mjs'

import { settleWithin } from './settle-within.mjs'

const apps: Application[] = []

async function start(root: new () => unknown, asyncContext = false) {
  const app = createApplication(root, {
    logger: false,
    asyncContext,
    transports: [fakeTransport({ kind: 'fake', entry: 'handlers', log: [] })],
  })
  apps.push(app)
  await app.init()
  return app.transport(fakeTransport)
}

function root(handlers: unknown[], options: Record<string, unknown> = {}) {
  return registerModule(class Root {}, { handlers, ...options } as object)
}

afterEach(async () => {
  await settleWithin(apps.splice(0).map((app) => app.close()))
})

describe('fakeTransport', () => {
  it('runs the guards and interceptors of the handler class', async () => {
    const log: string[] = []

    @Injectable()
    class Deny implements Guard {
      canActivate() {
        log.push('deny')
        return false
      }
    }
    @Injectable()
    class Around {
      intercept(_ctx: ExecutionContext, next: () => Promise<unknown>) {
        log.push('around')
        return next()
      }
    }
    @UseGuards(Deny)
    class Denied {}
    @UseInterceptors(Around)
    class Allowed {}
    class Inherits extends Denied {}
    const transport = await start(root([Denied, Allowed, Inherits]))

    expect(await transport.run(Denied)).toBe(false)
    expect(await transport.run(Allowed)).toBe(true)
    expect(await transport.run(Inherits)).toBe(false)
    expect(log).toEqual(['deny', 'around', 'deny'])
  })

  it('takes only true from a guard for consent', async () => {
    let result: unknown
    @Injectable()
    class Loose implements Guard {
      canActivate() {
        return result as boolean
      }
    }
    @UseGuards(Loose)
    class Handler {}
    const transport = await start(root([Handler]))

    for (result of ['yes', Promise.resolve('yes'), 1, {}]) {
      expect(await transport.run(Handler)).toBe(false)
    }
    for (result of [true, Promise.resolve(true)]) {
      expect(await transport.run(Handler)).toBe(true)
    }
  })

  it('reads what legacy decorators attached', async () => {
    const Marked = LegacyAttributes.createAttribute(Symbol.for('test.fake.Marked'))
    const seen: boolean[] = []

    @Injectable()
    class Reader implements Guard {
      canActivate(ctx: ExecutionContext) {
        seen.push(AttributeFactory.has(Marked, ctx.handler))
        return false
      }
    }
    class Handler {}
    LegacyUseGuards(Reader)(Handler)
    Marked()(Handler)
    const transport = await start(root([Handler]))

    expect(await transport.run(Handler)).toBe(false)
    expect(seen).toEqual([true])
  })

  it('gives guards the attributes of the handler class', async () => {
    const Marked = AttributeFactory.createAttribute(Symbol.for('test.fake.Marked'))

    @Injectable()
    class NeedsMark implements Guard {
      canActivate(ctx: ExecutionContext) {
        return AttributeFactory.has(Marked, ctx.handler)
      }
    }
    @Marked()
    class WithMark {}
    class Without {}
    const transport = await start(root([WithMark, Without], { guards: [NeedsMark] }))

    expect(await transport.run(WithMark)).toBe(true)
    expect(await transport.run(Without)).toBe(false)
  })

  it('runs inside the async context when the application has one', async () => {
    const seen: unknown[] = []

    @Injectable()
    class Recorder {
      async intercept(ctx: ExecutionContext, next: () => Promise<unknown>) {
        seen.push(currentContext() === ctx)
        ctx.onFinish(() => void seen.push(currentContext() === ctx))
        return next()
      }
    }
    class Handler {}
    const transport = await start(root([Handler], { interceptors: [Recorder] }), true)

    await transport.run(Handler)

    expect(seen).toEqual([true, true])
  })

  it('refuses a handler only where it inherits what its importers disagree about', async () => {
    const Marked = AttributeFactory.createAttribute(Symbol.for('test.fake.Marked'))
    class Handler {}
    @Marked()
    class Decided {}
    const app = (options: object) => {
      const Shared = registerModule(class Shared {}, options)
      const A = registerModule(class A {}, { imports: [Shared], attributes: [Marked()] })
      const B = registerModule(class B {}, { imports: [Shared] })
      return start(root([], { imports: [A, B] }))
    }

    await expect(app({ handlers: [Handler] })).rejects.toThrow(
      '[Navios] Module Shared inherits different values of the attribute Symbol(test.fake.Marked): ' +
        'one over Root -> A -> Shared, none over Root -> B -> Shared.',
    )
    const transport = await app({ handlers: [Decided], jobs: [Handler], openapi: { title: 'x' } })
    expect(transport.handlers).toEqual([Decided])
  })
})
