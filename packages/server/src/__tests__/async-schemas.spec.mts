import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'
import * as mini from 'zod/v4-mini'

import { validateSchema, ValidationError } from '../index.mjs'

import type { SchemaLike } from '../index.mjs'

/** Validates once, so that the schema is known to be asynchronous. */
async function prime(schema: SchemaLike, value: unknown): Promise<void> {
  await Promise.resolve(validateSchema(schema, value, 'body')).catch(() => {})
}

describe('asynchronous zod schemas', () => {
  it('run an asynchronous refinement once per validation', async () => {
    const check = vi.fn(async () => true)
    const schema = z.object({ name: z.string().refine(check) })
    await prime(schema, { name: 'a' })
    check.mockClear()

    expect(await validateSchema(schema, { name: 'b' }, 'body')).toEqual({ name: 'b' })
    expect(check).toHaveBeenCalledTimes(1)
    expect(check.mock.calls[0]).toEqual(['b'])
  })

  it('run a synchronous refinement next to an asynchronous one once', async () => {
    const check = vi.fn(() => true)
    const schema = z.object({
      name: z.string().refine(check),
      email: z.string().refine(async () => true),
    })
    await prime(schema, { name: 'a', email: 'a' })
    check.mockClear()

    await validateSchema(schema, { name: 'b', email: 'b' }, 'body')
    expect(check).toHaveBeenCalledTimes(1)
  })

  it('run an asynchronous transform once and use its result', async () => {
    const load = vi.fn(async (id: string) => ({ id }))
    const schema = z.object({ user: z.string().transform(load) })
    await prime(schema, { user: '1' })
    load.mockClear()

    expect(await validateSchema(schema, { user: '2' }, 'body')).toEqual({ user: { id: '2' } })
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('report the issues that ~standard.validate reports', async () => {
    const schema = z.object({
      name: z.string().refine(async () => false, 'is taken'),
      age: z.number(),
    })
    const value = { name: 'a', age: 'x' }
    const standard = await schema['~standard'].validate(value)
    await prime(schema, value)

    const error = await Promise.resolve(validateSchema(schema, value, 'query')).catch(
      (caught: unknown) => caught,
    )
    expect(error).toBeInstanceOf(ValidationError)
    expect((error as ValidationError).source).toBe('query')
    expect(
      (error as ValidationError).issues.map(({ message, path }) => ({ message, path })),
    ).toEqual(standard.issues?.map(({ message, path }) => ({ message, path })))
  })

  it('reject with what a refinement throws', async () => {
    const schema = z.object({
      name: z.string().refine(async (value) => {
        if (value === 'boom') {
          throw new Error('database is down')
        }
        return true
      }),
    })
    await prime(schema, { name: 'a' })
    await expect(Promise.resolve(validateSchema(schema, { name: 'boom' }, 'body'))).rejects.toThrow(
      'database is down',
    )
  })

  it('work with zod mini', async () => {
    const check = vi.fn(async () => true)
    const schema = mini.object({ name: mini.string().check(mini.refine(check)) })
    await prime(schema, { name: 'a' })
    check.mockClear()

    expect(await validateSchema(schema, { name: 'b' }, 'body')).toEqual({ name: 'b' })
    expect(check).toHaveBeenCalledTimes(1)
  })

  it('do not make other schemas asynchronous', async () => {
    await prime(
      z.string().refine(async () => true),
      'a',
    )
    expect(validateSchema(z.string(), 'b', 'body')).toBe('b')
  })
})

describe('an asynchronous zod refinement that rejects', () => {
  const unhandled: unknown[] = []
  const record = (reason: unknown) => {
    unhandled.push(reason)
  }
  let existing: NodeJS.UnhandledRejectionListener[] = []

  beforeEach(() => {
    unhandled.length = 0
    existing = process.listeners('unhandledRejection')
    process.removeAllListeners('unhandledRejection')
    process.on('unhandledRejection', record)
  })

  afterEach(() => {
    process.removeAllListeners('unhandledRejection')
    for (const listener of existing) {
      process.on('unhandledRejection', listener)
    }
  })

  const schemaWith = () =>
    z.object({
      name: z.string().refine(async (value) => {
        if (value === 'boom') {
          throw new Error('database is down')
        }
        return true
      }),
    })

  /** Validates, and waits until an unhandled rejection would be reported. */
  async function outcome(schema: SchemaLike, value: unknown): Promise<unknown> {
    const result = await Promise.resolve()
      .then(() => validateSchema(schema, value, 'body'))
      .catch((error: unknown) => error)
    await new Promise((resolve) => setTimeout(resolve, 5))
    return result
  }

  it('leaves no unhandled rejection on the first validation of a schema', async () => {
    const error = await outcome(schemaWith(), { name: 'boom' })
    expect((error as Error).message).toBe('database is down')
    expect(unhandled).toEqual([])
  })

  it('leaves no unhandled rejection after an invalid first value', async () => {
    const schema = schemaWith()
    expect(await outcome(schema, { name: 1 })).toBeInstanceOf(ValidationError)
    expect(((await outcome(schema, { name: 'boom' })) as Error).message).toBe('database is down')
    expect(unhandled).toEqual([])
  })

  it('leaves no unhandled rejection on later validations', async () => {
    const schema = schemaWith()
    expect(await outcome(schema, { name: 'a' })).toEqual({ name: 'a' })
    expect(((await outcome(schema, { name: 'boom' })) as Error).message).toBe('database is down')
    expect(unhandled).toEqual([])
  })
})

describe('synchronous zod schemas', () => {
  it('are validated synchronously from the first validation on', () => {
    const schema = z.object({ name: z.string() })
    expect(validateSchema(schema, { name: 'a' }, 'body')).toEqual({ name: 'a' })
    expect(validateSchema(schema, { name: 'b' }, 'body')).toEqual({ name: 'b' })
    expect(() => validateSchema(schema, { name: 1 }, 'body')).toThrow(ValidationError)
  })

  it('run a refinement once per validation after a first valid value', () => {
    const check = vi.fn(() => true)
    const schema = z.object({ name: z.string().refine(check) })
    validateSchema(schema, { name: 'a' }, 'body')
    check.mockClear()
    validateSchema(schema, { name: 'b' }, 'body')
    expect(check).toHaveBeenCalledTimes(1)
  })
})

describe('asynchronous schemas of other libraries', () => {
  it('are validated with ~standard.validate, whatever other methods they have', async () => {
    const safeParseAsync = vi.fn()
    const schema: SchemaLike & { safeParseAsync: unknown } = {
      '~standard': {
        version: 1,
        vendor: 'other',
        validate: async (value) => ({ value: `${String(value)}!` }),
      },
      safeParseAsync,
    }
    await prime(schema, 'a')
    expect(await validateSchema(schema, 'b', 'body')).toBe('b!')
    expect(safeParseAsync).not.toHaveBeenCalled()
  })
})
