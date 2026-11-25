import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z as z3 } from 'zod/v3'
import { z } from 'zod/v4'
import * as zm from 'zod/v4-mini'
import * as zc from 'zod/v4/core'

import { isPendingOutcome, parseSync, validate, validateEager } from '../validate.mjs'
import { scanZod } from '../zod.mjs'

import type { Schema } from '../schema.mjs'

describe('validate', () => {
  const unhandled = vi.fn()

  beforeEach(() => {
    unhandled.mockReset()
    process.on('unhandledRejection', unhandled)
  })

  afterEach(() => {
    process.off('unhandledRejection', unhandled)
  })

  const settled = () => new Promise((resolve) => setTimeout(resolve, 10))

  describe('asynchronous Zod checks', () => {
    it.each([
      ['passes', async () => true, true],
      ['fails', async () => false, false],
    ])('should run a check that %s once per call', async (_name, check, ok) => {
      const run = vi.fn(check)
      const schema = z.object({ name: z.string().refine(run, 'taken') })

      for (let call = 1; call <= 3; call++) {
        const outcome = await validate(schema, { name: 'x' })
        expect(outcome.ok).toBe(ok)
        expect(run).toHaveBeenCalledTimes(call)
        if (!outcome.ok) {
          expect(outcome.issues).toMatchObject([{ message: 'taken', path: ['name'] }])
          expect(outcome.cause).toBeInstanceOf(z.ZodError)
        }
      }
    })

    it('should report a check that rejects, and leave no rejection unhandled', async () => {
      const cause = new Error('uniqueness check failed: 503')
      const schema = z.object({
        name: z.string().refine(async () => {
          throw cause
        }),
      })

      for (let call = 1; call <= 2; call++) {
        expect(await validate(schema, { name: 'x' })).toEqual({
          ok: false,
          issues: [{ message: cause.message }],
          cause,
        })
      }
      await settled()
      expect(unhandled).not.toHaveBeenCalled()
    })

    it('should find a check behind a branch that earlier values did not reach', async () => {
      const run = vi.fn(async () => {
        throw new Error('503')
      })
      const schema = z.object({ name: z.string().refine(run).optional() })

      expect((await validate(schema, {})).ok).toBe(true)
      expect((await validate(schema, { name: 'x' })).ok).toBe(false)

      expect(run).toHaveBeenCalledTimes(1)
      await settled()
      expect(unhandled).not.toHaveBeenCalled()
    })

    it.each([
      ['superRefine', z.string().superRefine(async (_value, ctx) => void ctx.addIssue('no'))],
      ['transform', z.string().transform(async (value) => value.length)],
      ['codec', z.codec(z.string(), z.number(), { decode: async (s) => s.length, encode: String })],
      ['promise', z.promise(z.string())],
      ['lazy', z.lazy(() => z.string().refine(async () => true))],
      ['array', z.array(z.string().refine(async () => true))],
      [
        'record',
        z.record(
          z.string(),
          z.string().refine(async () => true),
        ),
      ],
      ['union', z.union([z.number(), z.string().refine(async () => true)])],
      ['mini', zm.string().check(zm.refine(async () => true))],
    ])('should be asynchronous for %s', (_name, schema) => {
      const value = schema instanceof z.ZodPromise ? Promise.resolve('x') : 'x'
      const input =
        schema instanceof z.ZodArray ? ['x'] : schema instanceof z.ZodRecord ? { a: 'x' } : value

      // Known before anything runs, because trying it out runs a check twice
      expect(scanZod(schema).userCode).toBe(true)
      expect(isPendingOutcome(validateEager(schema, input))).toBe(true)
    })

    it('should not call the default of a schema to find out', () => {
      const makeDefault = vi.fn(() => 'x')
      const schema = z.object({ a: z.string().default(makeDefault), b: z.string() })

      validateEager(schema, { a: 'given', b: 'x' })

      expect(makeDefault).not.toHaveBeenCalled()
    })
  })

  describe('synchronous Zod schemas', () => {
    it.each([
      ['plain', z.object({ name: z.string() }), { name: 'x' }],
      ['with a check', z.object({ name: z.string().refine((s) => s !== 'bad') }), { name: 'x' }],
      ['with a transform', z.string().transform(Number), '5'],
      ['mini', zm.object({ name: zm.string() }), { name: 'x' }],
      ['Zod 3', z3.object({ name: z3.string() }), { name: 'x' }],
    ])('should be validated synchronously: %s', (_name, schema, value) => {
      expect(validateEager(schema, value)).toMatchObject({ ok: true })
    })

    it('should take the fast path of Zod when they hold no function of the user', () => {
      const schema = z.object({
        id: z.uuid(),
        tags: z.array(z.string().min(1).trim()).optional(),
        kind: z.union([z.literal('a'), z.enum(['b', 'c'])]).default('a'),
        at: z.coerce.date().nullable(),
        meta: z.record(z.string(), z.int()).catch({}),
      })

      expect(scanZod(schema).userCode).toBe(false)
    })

    it('should run a failing check once and keep the ZodError', () => {
      const run = vi.fn(() => false)
      const schema = z.object({ name: z.string().refine(run, 'bad') })

      const outcome = validateEager(schema, { name: 'x' })

      expect(outcome).toMatchObject({ ok: false, issues: [{ message: 'bad', path: ['name'] }] })
      expect((outcome as { cause: unknown }).cause).toBeInstanceOf(z.ZodError)
      expect(run).toHaveBeenCalledTimes(1)
    })

    it('should validate recursive schemas', () => {
      const node = z.object({
        name: z.string(),
        get children() {
          return z.array(node)
        },
      })

      expect(validateEager(node, { name: 'a', children: [{ name: 'b', children: [] }] })).toEqual({
        ok: true,
        value: { name: 'a', children: [{ name: 'b', children: [] }] },
      })
    })
  })

  // What Zod drops the promise of when it validates synchronously
  describe.each<[string, (check: (value: string) => unknown) => Schema]>([
    ['a Zod 3 refinement', (check) => z3.object({ a: z3.string().refine(check, 'taken') })],
    [
      'a Zod 3 superRefine',
      (check) =>
        z3.object({
          a: z3.string().superRefine((value, ctx) => {
            const add = (ok: unknown) => {
              if (!ok) ctx.addIssue({ code: 'custom', message: 'taken' })
            }
            const result = check(value)
            return (result instanceof Promise ? result.then(add) : add(result)) as void
          }),
        }),
    ],
    [
      'a Zod 3 transform',
      (check) => z3.object({ a: z3.string().transform(check).pipe(z3.literal(true)) }),
    ],
    [
      'a Zod 3 preprocess',
      (check) =>
        z3.object({ a: z3.preprocess((value) => check(value as string), z3.literal(true)) }),
    ],
    [
      'a Zod 3 check in a union',
      (check) => z3.array(z3.union([z3.number(), z3.string().refine(check)])),
    ],
    [
      'a Zod Mini transform',
      (check) =>
        zm.object({ a: zm.pipe(zm.pipe(zm.string(), zm.transform(check)), zm.literal(true)) }),
    ],
    [
      'a zod/v4/core check',
      (check) =>
        new zc.$ZodString({ type: 'string', checks: [zc._refine(zc.$ZodCustom, check, 'taken')] }),
    ],
    [
      'a zod/v4/core transform',
      (check) =>
        new zc.$ZodPipe({
          type: 'pipe',
          in: new zc.$ZodTransform({ type: 'transform', transform: check as never }),
          out: new zc.$ZodLiteral({ type: 'literal', values: [true] }),
        }),
    ],
  ])('%s', (_name, makeSchema) => {
    const inputOf = (schema: Schema) => {
      if (schema instanceof z3.ZodArray) return ['x']
      return schema instanceof z3.ZodObject || schema instanceof zm.ZodMiniObject ? { a: 'x' } : 'x'
    }

    it.each([
      ['passes', async () => true, true],
      ['fails', async () => false, false],
    ])('should run an asynchronous check that %s once per call', async (_case, check, ok) => {
      const run = vi.fn(check)
      const schema = makeSchema(run)

      for (let call = 1; call <= 2; call++) {
        const outcome = await validate(schema, inputOf(schema))

        expect(outcome.ok).toBe(ok)
        expect(run).toHaveBeenCalledTimes(call)
      }
    })

    it.each([
      ['an async function', async () => Promise.reject(new Error('503'))],
      ['a function that returns a promise', () => Promise.reject(new Error('503'))],
    ])('should leave no rejection of %s unhandled', async (_case, check) => {
      for (const run of [
        (schema: Schema) => validate(schema, inputOf(schema)),
        async (schema: Schema) => validateEager(schema, inputOf(schema)),
      ]) {
        const schema = makeSchema(check)
        for (let call = 1; call <= 2; call++) {
          expect(await run(schema)).toMatchObject({ ok: false, issues: [{ message: '503' }] })
        }
      }
      const schema = makeSchema(check)
      expect(() => parseSync(schema, inputOf(schema))).toThrow('asynchronous schemas')

      await settled()
      expect(unhandled).not.toHaveBeenCalled()
    })

    it('should be validated synchronously when its function is synchronous', () => {
      const run = vi.fn((value: string) => value === 'x')
      const schema = makeSchema(run)

      expect(isPendingOutcome(validateEager(schema, inputOf(schema)))).toBe(false)
      expect(() => parseSync(schema, inputOf(schema))).not.toThrow()
      expect(run).toHaveBeenCalledTimes(2)
    })

    it('should report what a synchronous function throws, after running it once', async () => {
      const run = vi.fn(() => {
        throw new Error('boom')
      })
      const schema = makeSchema(run)

      const outcomes = [
        validateEager(schema, inputOf(schema)),
        await validate(schema, inputOf(schema)),
      ]

      for (const outcome of outcomes) {
        expect(outcome).toMatchObject({ ok: false, issues: [{ message: 'boom' }] })
      }
      expect(run).toHaveBeenCalledTimes(2)
    })
  })

  it('should take the fast path of Zod 3 when a schema holds no function of the user', () => {
    const plain = z3.object({
      id: z3.string().uuid(),
      tags: z3.array(z3.string().min(1).trim()).optional().default([]),
      kind: z3.discriminatedUnion('t', [z3.object({ t: z3.literal('a') })]),
      at: z3.coerce.date().nullable().catch(null),
      meta: z3.record(z3.number()).and(z3.object({})),
    })

    expect(scanZod(plain).userCode).toBe(false)
    expect(scanZod(plain.extend({ x: z3.string().refine(Boolean) })).userCode).toBe(true)
    expect(scanZod(z3.lazy(() => plain)).userCode).toBe(true)
  })

  it('should keep the ZodError of Zod 3, and report the issues of zod/v4/core', async () => {
    const v3 = await validate(
      z3.string().refine(async () => false),
      'x',
    )
    const core = new zc.$ZodString({ type: 'string' })

    expect((v3 as { cause: unknown }).cause).toBeInstanceOf(z3.ZodError)
    expect(validateEager(core, 'x')).toEqual({ ok: true, value: 'x' })
    expect(validateEager(core, 1)).toMatchObject({
      ok: false,
      issues: [{ code: 'invalid_type', path: [] }],
    })
  })

  it('should support schemas behind z.lazy, synchronously when they are', async () => {
    const mini = zm.lazy(() =>
      zm.pipe(
        zm.string(),
        zm.transform((s) => s.length),
      ),
    )
    const v3 = z3.lazy(() => z3.string().transform((s) => s.length))
    const asynchronous = z3.lazy(() => z3.string().transform(async (s) => s.length))

    for (const schema of [mini, v3]) {
      expect(validateEager(schema, 'abc')).toEqual({ ok: true, value: 3 })
    }
    expect(await validateEager(asynchronous, 'abc')).toEqual({ ok: true, value: 3 })
  })

  it('should leave the functions of a schema as they were', async () => {
    const transform = async (value: string) => value.length
    const schema = zm.transform(transform as (value: unknown) => Promise<number>)
    const v3 = z3.string().transform(() => Promise.resolve(1))
    const { effect } = v3._def as { effect: { transform?: unknown } }
    const before = effect.transform

    await validateEager(schema, 'x')
    await validateEager(v3, 'x')

    expect((schema._zod.def as { transform: unknown }).transform).toBe(transform)
    expect(effect.transform).toBe(before)
  })

  it('should not look through a schema that is made anew wherever it recurs', () => {
    const node = (): z.ZodType =>
      z.object({
        name: z.string(),
        get child() {
          return node().optional()
        },
      })

    expect(validateEager(node(), { name: 'a', child: { name: 'b' } })).toEqual({
      ok: true,
      value: { name: 'a', child: { name: 'b' } },
    })
  })

  describe('parseSync', () => {
    it('should refuse an asynchronous schema without leaving a rejection unhandled', async () => {
      const schema = z.string().refine(async () => {
        throw new Error('503')
      })

      expect(() => parseSync(schema, 'x')).toThrow('asynchronous schemas')
      await settled()
      expect(unhandled).not.toHaveBeenCalled()
    })

    it('should throw the ZodError of a failure', () => {
      expect(() => parseSync(z.string(), 1)).toThrow(z.ZodError)
    })
  })
})
