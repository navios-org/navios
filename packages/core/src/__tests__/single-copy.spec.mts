import { afterEach, describe, expect, it, vi } from 'vitest'

import { registerCopy } from '../internal/single-copy.mjs'

const registryKey = Symbol.for('navios.core.copies')

describe('registerCopy', () => {
  const saved = (globalThis as any)[registryKey]

  afterEach(() => {
    ;(globalThis as any)[registryKey] = saved
  })

  it('stays silent for one copy, also when it is evaluated again', () => {
    delete (globalThis as any)[registryKey]
    const warn = vi.fn()

    registerCopy('file:///app/node_modules/@navios/core/lib/index.mjs', warn)
    registerCopy('file:///app/node_modules/@navios/core/lib/index.mjs', warn)

    expect(warn).not.toHaveBeenCalled()
  })

  it('takes a reload with a query, as development servers make it, for the same copy', () => {
    delete (globalThis as any)[registryKey]
    const warn = vi.fn()

    registerCopy('file:///app/node_modules/@navios/core/lib/index.mjs', warn)
    registerCopy('file:///app/node_modules/@navios/core/lib/index.mjs?t=1732551000000', warn)

    expect(warn).not.toHaveBeenCalled()
  })

  it('counts nothing in a bundle, which does not know where the copy came from', () => {
    delete (globalThis as any)[registryKey]
    const warn = vi.fn()

    registerCopy(undefined, warn)
    registerCopy('file:///app/node_modules/@navios/core/lib/index.mjs', warn)

    expect(warn).not.toHaveBeenCalled()
    expect((globalThis as any)[registryKey].locations.size).toBe(1)
  })

  it.each([
    '../index.mjs',
    '../transport.mjs',
    '../testing/index.mjs',
    '../legacy-compat/index.mjs',
  ])('registers the copy when only %s is loaded', async (entry) => {
    delete (globalThis as any)[registryKey]
    vi.resetModules()

    await import(entry)

    expect((globalThis as any)[registryKey].locations.size).toBe(1)
  })

  it('registers one copy, without a warning, when every entry is loaded', async () => {
    delete (globalThis as any)[registryKey]
    vi.resetModules()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await import('../index.mjs')
    await import('../transport.mjs')
    await import('../testing/index.mjs')
    await import('../legacy-compat/index.mjs')

    expect((globalThis as any)[registryKey].locations.size).toBe(1)
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('warns once, naming every location, when a second copy loads', () => {
    delete (globalThis as any)[registryKey]
    const warn = vi.fn()

    registerCopy('file:///app/node_modules/@navios/core/lib/index.mjs', warn)
    registerCopy('file:///app/node_modules/x/node_modules/@navios/core/lib/index.mjs', warn)
    registerCopy('file:///app/node_modules/y/node_modules/@navios/core/lib/index.mjs', warn)

    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toContain('@navios/core is loaded more than once')
    expect(warn.mock.calls[0][0]).toContain('node_modules/x/node_modules/@navios/core')
  })
})
