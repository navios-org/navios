import { afterEach, describe, expect, it } from 'vitest'

import { AttributeFactory, Controller, Endpoint, Module, NaviosFactory } from '../index.mjs'
import { defineInMemoryEnvironment } from '../testing/index.mjs'

import type { NaviosApplication } from '../index.mjs'

const Public = AttributeFactory.createAttribute(Symbol.for('test.disputed.Public'))
const ping = { config: { method: 'GET', url: '/ping' } } as const

const apps: NaviosApplication<any>[] = []

/** An application in which one importer of a module is public and the other is not. */
async function create(controllers: Array<new () => unknown>) {
  @Module({ controllers })
  class SharedModule {}
  @Module({ imports: [SharedModule], attributes: [Public()] })
  class LandingModule {}
  @Module({ imports: [SharedModule, LandingModule] })
  class AppModule {}

  const app = await NaviosFactory.create(AppModule, {
    adapter: defineInMemoryEnvironment(),
    logger: false,
  })
  apps.push(app)
  return app
}

describe('an attribute that the importers of a module disagree about', () => {
  afterEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()))
  })

  it('fails init() where a route would inherit it', async () => {
    @Controller()
    class Open {
      @Endpoint(ping)
      ping() {
        return {}
      }
    }

    await expect((await create([Open])).init()).rejects.toThrow(
      '[Navios] Module SharedModule inherits different values of the attribute ' +
        'Symbol(test.disputed.Public): one over AppModule -> LandingModule -> SharedModule, none ' +
        'over AppModule -> SharedModule. Set it on the controllers or handlers it is meant for, ' +
        'or on SharedModule itself.',
    )
  })

  it('does not matter to a route that has its own, or to a module without routes', async () => {
    @Public()
    @Controller()
    class Decided {
      @Endpoint(ping)
      ping() {
        return {}
      }
    }

    const app = await create([Decided])
    await app.init()
    expect(app.routes().map((route) => AttributeFactory.has(Public, route))).toEqual([true])
    await (await create([])).init()
  })
})
