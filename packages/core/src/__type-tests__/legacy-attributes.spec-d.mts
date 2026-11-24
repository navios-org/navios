import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod/v4'

import { AttributeFactory as StandardAttributeFactory } from '../index.mjs'
import { AttributeFactory } from '../legacy-compat/index.mjs'

import type { RouteInfo } from '../index.mjs'

const route = {
  attributes: { handler: new Map(), controller: new Map(), module: new Map() },
} as unknown as RouteInfo

describe('legacy-compat AttributeFactory', () => {
  const Public = AttributeFactory.createAttribute(Symbol.for('type-test.Public'))
  const Roles = AttributeFactory.createAttribute(Symbol.for('type-test.Roles'), z.array(z.string()))
  const Limit = AttributeFactory.createAttribute(
    Symbol.for('type-test.Limit'),
    z.object({ max: z.coerce.number() }),
  )

  it('reads an attribute without a schema', () => {
    expectTypeOf(AttributeFactory.has(Public, route)).toEqualTypeOf<boolean>()
    expectTypeOf(AttributeFactory.get(Public, route)).toEqualTypeOf<true | null>()
    expectTypeOf(AttributeFactory.getAll(Public, route)).toEqualTypeOf<true[]>()
  })

  it('reads an attribute with a schema as the schema output', () => {
    expectTypeOf(AttributeFactory.has(Roles, route)).toEqualTypeOf<boolean>()
    expectTypeOf(AttributeFactory.get(Roles, route)).toEqualTypeOf<string[] | null>()
    expectTypeOf(AttributeFactory.getAll(Roles, route)).toEqualTypeOf<string[][]>()
    expectTypeOf(AttributeFactory.get(Limit, route)).toEqualTypeOf<{ max: number } | null>()
  })

  it('is read by the standard factory too, and reads standard attributes', () => {
    expectTypeOf(StandardAttributeFactory.get(Public, route)).toEqualTypeOf<true | null>()
    expectTypeOf(StandardAttributeFactory.getAll(Roles, route)).toEqualTypeOf<string[][]>()

    const StandardPublic = StandardAttributeFactory.createAttribute(Symbol.for('type-test.S'))
    const StandardRoles = StandardAttributeFactory.createAttribute(
      Symbol.for('type-test.SR'),
      z.array(z.string()),
    )
    expectTypeOf(AttributeFactory.get(StandardPublic, route)).toEqualTypeOf<true | null>()
    expectTypeOf(AttributeFactory.get(StandardRoles, route)).toEqualTypeOf<string[] | null>()
    expectTypeOf(StandardAttributeFactory.get(StandardPublic, route)).toEqualTypeOf<true | null>()
    expectTypeOf(StandardAttributeFactory.getAll(StandardRoles, route)).toEqualTypeOf<string[][]>()
  })

  it('reads from a plain attribute map', () => {
    const source = { attributes: new Map<symbol, unknown>() }
    expectTypeOf(AttributeFactory.get(Roles, source)).toEqualTypeOf<string[] | null>()
  })

  it('rejects something that is not an attribute', () => {
    // @ts-expect-error a string is not an attribute
    AttributeFactory.get('Public', route)
    // @ts-expect-error a string is not an attribute
    AttributeFactory.getAll('Public', route)
  })
})
