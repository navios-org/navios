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
})
