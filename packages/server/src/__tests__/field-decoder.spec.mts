import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import { fieldDecoder } from '../decoding/field-decoder.mjs'

import type { SchemaLike } from '../routing/endpoint-config.mjs'

/** What the decoder makes of fields, or `undefined` when it has nothing to do. */
const decode = (schema: SchemaLike, fields: Record<string, unknown>) => {
  const decoded = fieldDecoder(schema).decode?.(fields)
  return decoded === undefined ? undefined : { ...decoded }
}

describe('fieldDecoder', () => {
  it('makes a list of one value, and an empty one of none that is required', () => {
    const schema = z.object({
      tags: z.array(z.string()),
      maybe: z.array(z.string()).optional(),
      withDefault: z.array(z.string()).default(['x']),
      readonly: z.array(z.number()).readonly().nullable(),
    })
    expect(decode(schema, { tags: 'a', maybe: 'b', withDefault: 'c', readonly: '1' })).toEqual({
      tags: ['a'],
      maybe: ['b'],
      withDefault: ['c'],
      readonly: [1],
    })
    expect(decode(schema, { tags: ['a', 'b'] })).toEqual({ tags: ['a', 'b'], readonly: [] })
    expect(decode(schema, {})).toEqual({ tags: [], readonly: [] })
  })

  it('leaves a list that was not sent to the fallback of its schema', () => {
    const schema = z.object({
      tags: z.array(z.string()),
      caught: z.array(z.string()).catch(['c']),
      computed: z.array(z.string()).catch((ctx) => [String(ctx.value)]),
      readonly: z.array(z.string()).catch(['c']).readonly(),
      nullable: z.array(z.string()).nullable().catch(null),
      piped: z
        .array(z.string())
        .catch(['c'])
        .transform((list) => list.length),
      lazy: z.lazy(() => z.array(z.string()).catch(['c'])),
      either: z.union([z.array(z.string()).catch(['c']), z.array(z.number())]),
    })
    expect(decode(schema, {})).toEqual({ tags: [] })
    expect(decode(schema, { tags: 'a', caught: 'a', computed: 'a', nullable: 'a' })).toEqual({
      tags: ['a'],
      caught: ['a'],
      computed: ['a'],
      nullable: ['a'],
    })
    const root = z.object({ tags: z.array(z.string()) }).catch({ tags: ['c'] })
    expect(decode(root, {})).toEqual({})
    expect(decode(root, { tags: 'a' })).toEqual({ tags: ['a'] })
    const both = z
      .object({ a: z.array(z.string()) })
      .and(z.object({ b: z.array(z.string()) }).catch({ b: ['c'] }))
    expect(decode(both, {})).toEqual({ a: [] })
    const shared = z.array(z.string()).catch(['c']).meta({ id: 'FieldDecoderCaught' })
    expect(decode(z.object({ a: shared, b: shared }), {})).toEqual({})
  })

  it('does not take empty text for null: a client leaves null out of a url', () => {
    const schema = z.object({ n: z.number().nullable(), l: z.array(z.string()).nullable() })
    expect(decode(schema, { n: '', l: '' })).toEqual({ n: '', l: [''] })
  })

  it('converts the exact text of a number and of a boolean', () => {
    const schema = z.object({
      n: z.number().nullable(),
      i: z.int().optional(),
      c: z.coerce.number<number>(),
      b: z.boolean(),
      e: z.enum({ A: 1, B: 2 }),
      l: z.literal([5, true]),
    })
    expect(decode(schema, { n: '-1.5e3', i: '0', c: '7', b: 'false', e: '2', l: 'true' })).toEqual({
      n: -1500,
      i: 0,
      c: 7,
      b: false,
      e: 2,
      l: true,
    })
    // Not the text of a number: the schema judges it as it is.
    for (const text of ['', ' 1', '1 ', '+1', '01', '0x1', '.5', '1.', '1,5', 'NaN', 'Infinity']) {
      expect(decode(schema, { n: text })).toMatchObject({ n: text })
    }
    for (const text of ['1', '0', 'TRUE', 'yes', '', 'true ']) {
      expect(decode(schema, { b: text })).toMatchObject({ b: text })
    }
    // Another number would be meant.
    expect(decode(schema, { n: '9007199254740993', i: '1e999' })).toMatchObject({
      n: '9007199254740993',
      i: '1e999',
    })
    expect(decode(schema, { n: '9007199254740991' })).toMatchObject({ n: 9007199254740991 })
    // A field that is not a list keeps the list it was sent.
    expect(decode(schema, { n: ['1', '2'], b: ['true'] })).toMatchObject({
      n: ['1', '2'],
      b: ['true'],
    })
  })

  it('converts the JSON text of an object, and of the elements of an array', () => {
    const schema = z.object({
      o: z.object({ a: z.number() }),
      r: z.record(z.string(), z.number()).optional(),
      os: z.array(z.object({ a: z.number() })),
      m: z.array(z.array(z.number())),
      ns: z.array(z.number()),
      t: z.tuple([z.number(), z.boolean()]),
    })
    expect(
      decode(schema, {
        o: ' {"a":1}',
        r: '{"x":1}',
        os: ['{"a":1}', '{"a":2}'],
        m: '[1,2]',
        ns: ['1', 'x'],
        t: ['1', 'true'],
      }),
    ).toEqual({
      o: { a: 1 },
      r: { x: 1 },
      os: [{ a: 1 }, { a: 2 }],
      m: [[1, 2]],
      ns: [1, 'x'],
      t: [1, true],
    })
    for (const text of ['{bad', '[1]', '1', 'null', '{"__proto__":{}}']) {
      expect(decode(schema, { o: text })).toMatchObject({ o: text })
    }
  })

  it('leaves a field alone that may be a string, or about which nothing is known', () => {
    const schema = z.object({
      s: z.string(),
      u: z.union([z.string(), z.number()]),
      uo: z.union([z.string(), z.object({ a: z.number() })]),
      ua: z.union([z.string(), z.array(z.string())]),
      en: z.enum(['1', 'true']),
      lit: z.literal(['a', 1]),
      sb: z.stringbool(),
      codec: z.codec(z.string(), z.number(), { decode: Number, encode: String }),
      any: z.any(),
      date: z.coerce.date(),
      big: z.coerce.bigint(),
      json: z.json(),
      file: z.file(),
      files: z.array(z.file()).optional(),
      pre: z.preprocess((value) => String(value).split(','), z.array(z.string())),
      preOptional: z.preprocess((value) => value, z.number()).optional(),
    })
    const { files: _, ...shape } = schema.shape
    expect(fieldDecoder(z.object(shape)).decode).toBeUndefined()
    const file = new File([], 'a')
    expect(decode(schema, { files: file, s: '1' })).toEqual({ files: [file], s: '1' })
  })

  it('has nothing to do for a schema without such fields', () => {
    expect(fieldDecoder(z.object({ a: z.string() }))).toEqual({ known: true, decode: undefined })
    expect(fieldDecoder(z.object({}))).toEqual({ known: true, decode: undefined })
    expect(fieldDecoder(z.any())).toEqual({ known: false, decode: undefined })
    expect(fieldDecoder(z.union([z.object({ n: z.number() }), z.any()])).known).toBe(false)
    expect(fieldDecoder(undefined).known).toBe(false)
  })

  it('follows references, unions, intersections and records', () => {
    const named = z.object({
      tags: z.array(z.string()).meta({ id: 'FieldDecoder/100%' }),
      meta: z.object({ a: z.number() }).meta({ id: 'FieldDecoderMeta' }),
    })
    expect(decode(named, { tags: 'a', meta: '{"a":1}' })).toEqual({ tags: ['a'], meta: { a: 1 } })
    expect(decode(named.meta({ id: 'FieldDecoderRoot' }), { tags: 'a' })).toEqual({ tags: ['a'] })

    const union = z.discriminatedUnion('k', [
      z.object({ k: z.literal('a'), tags: z.array(z.string()), n: z.number() }),
      z.object({ k: z.literal('b'), title: z.string(), n: z.string() }),
    ])
    // `n` may be a string in one of them, and `tags` is required in one only.
    expect(decode(union, { k: 'a', tags: 'x', n: '1' })).toEqual({ k: 'a', tags: ['x'], n: '1' })
    expect(decode(union, { k: 'b', title: '[1,2]' })).toEqual({ k: 'b', title: '[1,2]' })
    expect(fieldDecoder(union).known).toBe(true)

    const both = z.object({ a: z.string() }).and(z.object({ n: z.array(z.number()) }))
    expect(decode(both, { a: '1', n: '2' })).toEqual({ a: '1', n: [2] })
    expect(decode(z.object({ n: z.number() }).nullable(), { n: '1' })).toEqual({ n: 1 })
    expect(decode(z.record(z.string(), z.number()), { x: '1', y: 'z' })).toEqual({ x: 1, y: 'z' })
    expect(decode(z.object({ s: z.string() }).catchall(z.number()), { s: '1', x: '2' })).toEqual({
      s: '1',
      x: 2,
    })
    expect(
      decode(
        z.object({ n: z.number() }).transform((value) => value),
        { n: '1' },
      ),
    ).toEqual({
      n: 1,
    })

    const tree = z.object({
      n: z.number(),
      get children() {
        return z.array(tree).optional()
      },
    })
    expect(decode(tree, { n: '1', children: '{"n":2}' })).toEqual({ n: 1, children: [{ n: 2 }] })
  })

  it('takes names of members of every object as plain names', () => {
    const schema = z.object({ n: z.number(), toString: z.number().optional() })
    const decoded = fieldDecoder(schema).decode!(
      Object.assign(Object.create(null), { toString: '1', constructor: '2', n: '3' }),
    )
    expect(Object.entries(decoded)).toEqual([
      ['toString', 1],
      ['constructor', '2'],
      ['n', 3],
    ])
    expect(Object.getPrototypeOf(decoded)).toBe(null)
  })

  it('converts a schema to JSON Schema once', () => {
    let conversions = 0
    const schema = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: (value: unknown) => ({ value }),
        jsonSchema: {
          input: () => {
            conversions++
            return { type: 'object', properties: { n: { type: 'number' } } }
          },
        },
      },
    } as unknown as SchemaLike
    expect(decode(schema, { n: '1' })).toEqual({ n: 1 })
    expect(decode(schema, { n: '2' })).toEqual({ n: 2 })
    expect(conversions).toBe(1)
  })
})
