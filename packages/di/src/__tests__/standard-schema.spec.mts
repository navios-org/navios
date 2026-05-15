import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import { validateStandardSchema } from '../token/schema.mjs'

describe('validateStandardSchema', () => {
  it('returns value on a valid input', async () => {
    const schema = z.object({ host: z.string(), port: z.number() })
    const result = await validateStandardSchema(schema, { host: 'a', port: 1 })
    expect(result).toEqual({ ok: true, value: { host: 'a', port: 1 } })
  })

  it('returns issues on an invalid input', async () => {
    const schema = z.object({ host: z.string() })
    const result = await validateStandardSchema(schema, { host: 42 })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues.length).toBeGreaterThan(0)
    }
  })
})
