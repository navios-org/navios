import { describe, expect, it } from 'vitest'

import { classMetadata } from '../metadata/class-store.mjs'

describe('classMetadata', () => {
  const handlers = classMetadata<{ name: string }>(
    Symbol('test.handlers'),
    'a queue handler',
    'QueueHandler',
  )

  it('keeps what is defined on the class itself, out of sight', () => {
    class Jobs {}
    handlers.define(Jobs, { name: 'jobs' })

    expect(handlers.has(Jobs)).toBe(true)
    expect(handlers.get(Jobs)).toEqual({ name: 'jobs' })
    expect(Object.keys(Jobs)).toEqual([])
  })

  it('can be defined again', () => {
    class Jobs {}
    handlers.define(Jobs, { name: 'first' })
    handlers.define(Jobs, { name: 'second' })

    expect(handlers.get(Jobs)).toEqual({ name: 'second' })
  })

  it('does not count for a subclass, and says how to fix a class without it', () => {
    class Jobs {}
    class MoreJobs extends Jobs {}
    handlers.define(Jobs, { name: 'jobs' })

    expect(handlers.has(MoreJobs)).toBe(false)
    expect(() => handlers.get(MoreJobs)).toThrow(
      '[Navios] MoreJobs is not a queue handler. Make sure it is decorated with @QueueHandler.',
    )
  })
})
