import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import { Token } from '../token/token.mjs'

describe('Token', () => {
  it('creates a plain token with no schema', () => {
    const tok = Token.create<string>('MyValue')
    expect(tok.name).toBe('MyValue')
    expect(tok.schema).toBeUndefined()
  })

  it('creates a token with a Standard Schema', () => {
    const schema = z.object({ id: z.string() })
    const tok = Token.create<{ id: string }, typeof schema>('Entity', schema)
    expect(tok.schema).toBe(schema)
  })
})
