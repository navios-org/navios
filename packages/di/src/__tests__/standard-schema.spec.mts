import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import { validateStandardSchema } from '../token/schema.mjs'

import type { StandardSchemaV1 } from '../token/schema.mjs'

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

  it('awaits an async-validating schema on both branches', async () => {
    const asyncSchema = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: (value: unknown) =>
          Promise.resolve(
            typeof value === 'string' ? { value } : { issues: [{ message: 'must be a string' }] },
          ),
      },
    } satisfies StandardSchemaV1<unknown, string>

    const ok = await validateStandardSchema(asyncSchema, 'hello')
    expect(ok).toEqual({ ok: true, value: 'hello' })

    const fail = await validateStandardSchema(asyncSchema, 42)
    expect(fail.ok).toBe(false)
    if (!fail.ok) {
      expect(fail.issues.length).toBeGreaterThan(0)
    }
  })
})
