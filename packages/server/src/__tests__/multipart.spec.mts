import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import { createMultipartCollector } from '../decoding/multipart-collector.mjs'

describe('createMultipartCollector', () => {
  it('uses the schema to tell arrays and objects from scalars', () => {
    const schema = z.object({
      title: z.string(),
      files: z.array(z.instanceof(File)).optional(),
      meta: z.object({ tags: z.array(z.string()) }),
      items: z.array(z.object({ id: z.number() })),
    })
    const collector = createMultipartCollector(schema)
    const file = new File(['x'], 'a.txt')
    collector.add('title', '{not json}')
    collector.add('files', file)
    collector.add('meta', '{"tags":["a"]}')
    collector.add('items', '{"id":1}')
    expect(collector.result()).toEqual({
      title: '{not json}',
      files: [file],
      meta: { tags: ['a'] },
      items: [{ id: 1 }],
    })
    expect(schema.safeParse(collector.result()).success).toBe(true)
  })

  it('falls back to the shape of the parts without schema information', () => {
    const collector = createMultipartCollector(undefined)
    collector.add('tag', 'a')
    collector.add('tag', 'b')
    collector.add('meta', '{"x":1}')
    collector.add('name', 'plain')
    expect(collector.result()).toEqual({ tag: ['a', 'b'], meta: { x: 1 }, name: 'plain' })
  })

  it('converts a schema to JSON Schema once, not for every request', () => {
    const schema = z.object({ tags: z.array(z.string()) })
    const standard = schema['~standard'] as unknown as {
      jsonSchema: { input: (options: unknown) => unknown }
    }
    const convert = standard.jsonSchema.input
    let conversions = 0
    standard.jsonSchema.input = (options) => {
      conversions++
      return convert(options)
    }
    for (let request = 0; request < 3; request++) {
      const collector = createMultipartCollector(schema)
      collector.add('tags', 'a')
      expect(collector.result()).toEqual({ tags: ['a'] })
    }
    expect(conversions).toBe(1)
  })

  it('takes field names that are members of Object.prototype as plain fields', () => {
    const collector = createMultipartCollector(undefined)
    collector.add('toString', 'a')
    collector.add('constructor', 'b')
    collector.add('constructor', 'c')
    collector.add('__proto__', '{"polluted":true}')
    const result = collector.result()
    expect(Object.keys(result).sort()).toEqual(['__proto__', 'constructor', 'toString'])
    expect(result.toString).toBe('a')
    expect(result.constructor).toEqual(['b', 'c'])
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect((result as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('knows a declared field named like the prototype of an object', () => {
    const schema = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: (value: unknown) => ({ value }),
        jsonSchema: { input: () => JSON.parse('{"properties":{"__proto__":{"type":"array"}}}') },
      },
    } as never
    const collector = createMultipartCollector(schema)
    collector.add('__proto__', 'a')
    // The schema describes its fields, so nothing is guessed about the others.
    collector.add('title', '[1]')
    collector.add('isArray', 'x')
    const result = collector.result()
    expect(Object.entries(result)).toEqual([
      ['__proto__', ['a']],
      ['title', '[1]'],
      ['isArray', 'x'],
    ])
  })

  it('keeps every part of a field that was sent several times', () => {
    const collector = createMultipartCollector(z.object({ title: z.string() }))
    collector.add('title', 'a')
    collector.add('title', 'b')
    collector.add('other', 'c')
    expect(collector.result()).toEqual({ title: ['a', 'b'], other: 'c' })
  })

  it('does not take the JSON of one part for several parts', () => {
    const collector = createMultipartCollector(undefined)
    collector.add('list', '[1,2]')
    collector.add('list', '[3]')
    collector.add('bad', '{"__proto__":{"a":1}}')
    expect({ ...collector.result() }).toEqual({
      list: [[1, 2], [3]],
      bad: '{"__proto__":{"a":1}}',
    })
  })

  it('leaves text alone when the schema describes its fields without naming them', () => {
    const collector = createMultipartCollector(z.record(z.string(), z.string()))
    collector.add('title', '[1]')
    expect({ ...collector.result() }).toEqual({ title: '[1]' })
  })

  it('gives an empty array for a required array of which no part was sent', () => {
    const schema = z.object({ tags: z.array(z.string()), files: z.array(z.file()).optional() })
    expect({ ...createMultipartCollector(schema).result() }).toEqual({ tags: [] })
  })

  it('reads the empty text that a client writes for null as null', () => {
    const schema = z.object({
      object: z.object({ a: z.number() }).nullable(),
      number: z.number().nullable(),
      boolean: z.boolean().nullish(),
      file: z.instanceof(File).nullable(),
      zodFile: z.file().nullable(),
      blob: z.instanceof(Blob).nullable(),
      maybe: z.union([z.file(), z.number(), z.null()]),
      numbers: z.array(z.number().nullable()),
      files: z.array(z.instanceof(File).nullable()),
      list: z.array(z.string()).nullable(),
      dictionary: z.record(z.string(), z.number()).nullable(),
      nothing: z.null(),
    })
    const collector = createMultipartCollector(schema)
    for (const name of Object.keys(schema.shape)) {
      collector.add(name, '')
    }
    collector.add('numbers', '1')
    const result = collector.result()
    expect({ ...result }).toEqual({
      object: null,
      number: null,
      boolean: null,
      file: null,
      zodFile: null,
      blob: null,
      maybe: null,
      numbers: [null, 1],
      files: [null],
      list: null,
      dictionary: null,
      nothing: null,
    })
    expect(schema.safeParse(result).success).toBe(true)
  })

  it('leaves empty text alone where it may be meant', () => {
    const schema = z.object({
      text: z.string().nullable(),
      state: z.enum(['', 'on']).nullable(),
      either: z.union([z.string(), z.number(), z.null()]),
      fileOrText: z.union([z.file(), z.string(), z.null()]),
      anything: z.any().nullable(),
      custom: z.custom<string>((value) => typeof value === 'string').nullable(),
      number: z.number(),
      file: z.instanceof(File),
      texts: z.array(z.string().nullable()),
    })
    const collector = createMultipartCollector(schema)
    const expected: Record<string, unknown> = {}
    for (const name of Object.keys(schema.shape)) {
      collector.add(name, '')
      expected[name] = name === 'texts' ? [''] : ''
    }
    expect({ ...collector.result() }).toEqual(expected)
  })

  it('gives a file the last part of the name it was sent with', async () => {
    const collect = (name: string | undefined) => {
      const collector = createMultipartCollector(undefined)
      const file = new File(['abc'], name ?? '', { type: 'text/x-a', lastModified: 5 })
      if (name === undefined) {
        // What a runtime may make of a part without a file name.
        Object.defineProperty(file, 'name', { value: undefined })
      }
      collector.add('file', file)
      return collector.result().file as File
    }
    for (const [sent, name] of [
      ['../../etc/passwd', 'passwd'],
      ['/etc/passwd', 'passwd'],
      ['C:\\dir\\a.txt', 'a.txt'],
      ['a/b\\c', 'c'],
      ['dir/', ''],
      ['..', ''],
      ['.', ''],
      ['a/..', ''],
      ['', ''],
      [undefined, ''],
    ] as const) {
      const file = collect(sent)
      expect(file.name).toBe(name)
      expect(file).toBeInstanceOf(File)
      expect([file.type, file.lastModified, await file.text()]).toEqual(['text/x-a', 5, 'abc'])
    }
    const plain = new File(['abc'], 'a.b..c')
    const collector = createMultipartCollector(undefined)
    collector.add('file', plain)
    expect(collector.result().file).toBe(plain)
  })
})
