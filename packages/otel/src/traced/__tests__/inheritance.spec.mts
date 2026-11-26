import { trace } from '@opentelemetry/api'
import { describe, expect, it } from 'vitest'

import type { ClassType } from '@navios/core'

import { Traceable as LegacyTraceable, Traced as LegacyTraced } from '../../legacy-compat/index.mjs'
import { traceInstance } from '../trace-instance.mjs'
import { tracedClasses } from '../traced-metadata.mjs'
import { Traceable, Traced } from '../traced.mjs'

const extractTracedMetadata = (target: ClassType) => tracedClasses.get(target)!

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
  users: {
    name: 'users',
    attributes: { layer: 'base', team: 'a' },
    enabled: false,
    methods: ['list', 'remove'],
  },
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

describe('@Traceable on a subclass', () => {
  it('keeps the span name and the attributes of the base class', () => {
    @Traced({ name: 'base-service', attributes: { layer: 'base' } })
    class Base {
      list() {}
    }

    @Traceable({ attributes: { team: 'a' } })
    class Child extends Base {
      @Traced()
      remove() {}
    }

    expect(seen(Child)).toEqual({
      name: 'base-service',
      attributes: { layer: 'base', team: 'a' },
      enabled: false,
      methods: ['remove'],
    })
    expect(seen(Base)).toEqual({
      name: 'base-service',
      attributes: { layer: 'base' },
      enabled: true,
      methods: [],
    })
  })
})

describe('a subclass without a decorator', () => {
  it('is not traced as its base class', () => {
    @Traced({ name: 'base-service' })
    class Base {
      list() {}
    }
    class Child extends Base {}

    expect(tracedClasses.has(Base)).toBe(true)
    expect(tracedClasses.has(Child)).toBe(false)

    const child = traceInstance(new Child(), Child, trace.getTracer('test'))
    expect(Object.getOwnPropertyNames(child)).toEqual([])
  })
})
