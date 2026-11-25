import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import { AttributeFactory } from '../attributes/index.mjs'
import { describeHandlerClass } from '../metadata/handler-class.mjs'

import type { HandlerClassMetadata } from '../metadata/handler-class.mjs'

const Public = AttributeFactory.createAttribute(Symbol.for('test.attributes.Public'))
const Roles = AttributeFactory.createAttribute(
  Symbol.for('test.attributes.Roles'),
  z.array(z.string()).default(['user']),
)

const described = new Map<unknown, HandlerClassMetadata>()

function Handlers() {
  return (target: abstract new () => unknown, context: ClassDecoratorContext) => {
    described.set(target, describeHandlerClass(context))
  }
}

describe('AttributeFactory', () => {
  @Public()
  @Handlers()
  @Roles(['admin'])
  class Controller {
    @Roles(undefined)
    method() {}

    @Public()
    field = () => {}
  }
  const metadata = () => described.get(Controller)!
  const layers = (member: string) => ({
    attributes: {
      handler: metadata().members.get(member)!.attributes,
      controller: metadata().attributes,
      module: new Map<symbol, unknown>([[Roles.token, ['module']]]),
    },
  })
  const at = (member: string) => layers(member) as never

  it('attaches a value to a class, a method and a field', () => {
    expect(AttributeFactory.has(Public, { attributes: metadata().attributes })).toBe(true)
    expect(metadata().members.get('method')!.attributes.get(Roles.token)).toEqual(['user'])
    expect(metadata().members.get('field')!.attributes.get(Public.token)).toBe(true)
  })

  it('reads the most specific value, or all of them', () => {
    expect(AttributeFactory.get(Roles, at('method'))).toEqual(['user'])
    expect(AttributeFactory.get(Roles, at('field'))).toEqual(['admin'])
    expect(AttributeFactory.getAll(Roles, at('method'))).toEqual([['user'], ['admin'], ['module']])
    expect(AttributeFactory.get(Public, at('method'))).toBe(true)
    expect(AttributeFactory.getAll(Public, at('field'))).toEqual([true, true])
  })

  it('gives null when nothing has it', () => {
    const Missing = AttributeFactory.createAttribute(Symbol.for('test.attributes.Missing'))

    expect(AttributeFactory.get(Missing, at('method'))).toBeNull()
    expect(AttributeFactory.getAll(Missing, at('method'))).toEqual([])
    expect(AttributeFactory.has(Missing, at('method'))).toBe(false)
  })

  it('is a value as well, for options that list attributes', () => {
    const { token, value } = Roles(['a'])

    expect([token, value]).toEqual([Roles.token, ['a']])
    expect([Public().token, Public().value]).toEqual([Public.token, true])
  })

  it('refuses a value its schema does not accept', () => {
    expect(() => Roles([1] as never)).toThrow(
      '[Navios] Invalid value for attribute Symbol(test.attributes.Roles)',
    )
  })

  it('refuses a schema that validates asynchronously', () => {
    const Async = AttributeFactory.createAttribute(
      Symbol.for('test.attributes.Async'),
      z.string().refine(async () => true),
    )

    expect(() => Async('x')).toThrow('validates synchronously')
  })

  it('refuses what it cannot be attached to', () => {
    const context = (over: object) =>
      ({ kind: 'method', name: 'x', metadata: {}, ...over }) as never

    expect(() => Public()(vi.fn(), context({ name: Symbol('s') }))).toThrow('symbol-named')
    expect(() => Public()(vi.fn(), context({ kind: 'getter' }))).toThrow(
      'classes, methods and fields',
    )
  })
})
