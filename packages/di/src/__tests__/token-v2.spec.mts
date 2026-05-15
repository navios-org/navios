import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import { Token } from '../token/token.mjs'

import type { FactoryContext } from '../internal/context/factory-context.mjs'

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

  it('.bind(value) pre-binds args and produces a callable token', async () => {
    const schema = z.object({ port: z.number() })
    const tok = Token.create<{ port: number }, typeof schema>('Cfg', schema)
    const bound = tok.bind({ port: 5432 })
    expect(bound.value).toEqual({ port: 5432 })
    expect(bound.id).toBe(tok.id)
  })

  it('.fromFactory(fn) produces a lazy-resolving token', async () => {
    const schema = z.object({ port: z.number() })
    const tok = Token.create<{ port: number }, typeof schema>('Cfg', schema)
    const factoryFn = vi.fn(async () => ({ port: 9999 }))
    const factoryTok = tok.fromFactory(factoryFn)
    expect(factoryTok.resolved).toBe(false)
    await factoryTok.resolve({} as FactoryContext)
    expect(factoryTok.resolved).toBe(true)
    expect(factoryTok.value).toEqual({ port: 9999 })
  })
})
