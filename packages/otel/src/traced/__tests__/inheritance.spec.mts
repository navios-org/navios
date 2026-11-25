import { describe, expect, it } from 'vitest'

import type { ClassType } from '@navios/di'

import { Traceable as LegacyTraceable, Traced as LegacyTraced } from '../../legacy-compat/index.mjs'
import { extractTracedMetadata, Traceable, Traced } from '../index.mjs'

const seen = (target: ClassType) => {
  const { name, attributes, enabled, methods } = extractTracedMetadata(target)
  return { name, attributes, enabled, methods: [...methods.keys()] }
}

const expected = {
  base: {
    name: 'base-service',
    attributes: { layer: 'base', team: 'a' },
    enabled: true,
    methods: ['list'],
  },
  orders: {
    name: 'orders-service',
    attributes: { layer: 'orders', team: 'a' },
    enabled: true,
    methods: ['list', 'create'],
  },
  users: { name: 'users', attributes: undefined, enabled: false, methods: ['list', 'remove'] },
}

describe('traced metadata of a subclass', () => {
  it('adds to that of its base class and leaves it alone', () => {
    @Traced({ name: 'base-service', attributes: { layer: 'base', team: 'a' } })
    class Base {
      @Traced({ name: 'base-list' })
      list() {}
    }

    @Traced({ name: 'orders-service', attributes: { layer: 'orders' } })
    class Orders extends Base {
      @Traced({ name: 'orders-create' })
      create() {}
    }

    @Traceable({ name: 'users' })
    class Users extends Base {
      @Traced({ name: 'users-remove' })
      remove() {}

      @Traced({ name: 'users-list' })
      override list() {}
    }

    expect(seen(Base)).toEqual(expected.base)
    expect(seen(Orders)).toEqual(expected.orders)
    expect(seen(Users)).toEqual(expected.users)
    expect(extractTracedMetadata(Base).methods.get('list')!.name).toBe('base-list')
    expect(extractTracedMetadata(Orders).methods.get('list')!.name).toBe('base-list')
    expect(extractTracedMetadata(Users).methods.get('list')!.name).toBe('users-list')
  })

  it('does so with legacy decorators as well', () => {
    class Base {
      list() {}
    }
    class Orders extends Base {
      create() {}
    }
    class Users extends Base {
      remove() {}
      override list() {}
    }
    // What a compiler emits for them.
    const decorate = (target: ClassType, name: string, decorator: any) => {
      const descriptor = Object.getOwnPropertyDescriptor(target.prototype, name)!
      Object.defineProperty(
        target.prototype,
        name,
        decorator(target.prototype, name, descriptor) ?? descriptor,
      )
    }

    decorate(Base, 'list', LegacyTraced({ name: 'base-list' }))
    LegacyTraced({ name: 'base-service', attributes: { layer: 'base', team: 'a' } })(Base)
    decorate(Orders, 'create', LegacyTraced({ name: 'orders-create' }))
    LegacyTraced({ name: 'orders-service', attributes: { layer: 'orders' } })(Orders)
    decorate(Users, 'remove', LegacyTraced({ name: 'users-remove' }))
    decorate(Users, 'list', LegacyTraced({ name: 'users-list' }))
    LegacyTraceable({ name: 'users' })(Users)

    expect(seen(Base)).toEqual(expected.base)
    expect(seen(Orders)).toEqual(expected.orders)
    expect(seen(Users)).toEqual(expected.users)
    expect(extractTracedMetadata(Base).methods.get('list')!.name).toBe('base-list')
  })
})
