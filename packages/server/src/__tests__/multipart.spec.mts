import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import { createMultipartCollector } from '../adapter/multipart-collector.mjs'

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

  it('does not take a member of Object.prototype for a declared field', () => {
    const schema = z.object({ title: z.string() })
    const collector = createMultipartCollector(schema)
    collector.add('title', 'x')
    collector.add('toString', 'y')
    expect(schema.safeParse(collector.result())).toEqual({ success: true, data: { title: 'x' } })
    expect(z.record(z.string(), z.string()).safeParse(collector.result()).success).toBe(true)
  })
})
