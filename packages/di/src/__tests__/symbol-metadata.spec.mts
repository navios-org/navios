import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const symbols = Symbol as { metadata?: symbol }

describe('Symbol.metadata', () => {
  let original: symbol | undefined

  beforeEach(() => {
    original = symbols.metadata
    delete symbols.metadata
    vi.resetModules()
  })

  afterEach(() => {
    if (original === undefined) {
      delete symbols.metadata
    } else {
      symbols.metadata = original
    }
  })

  it.each([
    ['@navios/di', () => import('../index.mjs')],
    ['@navios/di/testing', () => import('../testing/index.mjs')],
    ['@navios/di/legacy-compat', () => import('../legacy-compat/index.mjs')],
  ])('is defined once %s is loaded', async (_name, load) => {
    expect(symbols.metadata).toBeUndefined()

    await load()

    expect(typeof symbols.metadata).toBe('symbol')
  })

  it('keeps a Symbol.metadata that already exists', async () => {
    const existing = Symbol('existing')
    symbols.metadata = existing

    await import('../index.mjs')

    expect(symbols.metadata).toBe(existing)
  })
})
