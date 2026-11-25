import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { runAdapterConformance } from '../conformance/index.mjs'
import { s } from '../conformance/schema.mjs'
import { defineInMemoryEnvironment } from '../testing/index.mjs'

describe('conformance schema helper', () => {
  it('validates, coerces and strips like a Standard Schema', () => {
    const schema = s.object({ name: s.string({ min: 1 }), age: s.number({ coerce: true }) })
    expect(schema['~standard'].validate({ name: 'a', age: '3', extra: 1 })).toEqual({
      value: { name: 'a', age: 3 },
    })
    const failed = schema['~standard'].validate({ name: '', age: 'x' }) as { issues: unknown[] }
    expect(failed.issues).toHaveLength(2)
  })
})

runAdapterConformance({
  runner: { describe, it, expect, beforeAll, afterAll },
  name: 'in-memory',
  adapter: defineInMemoryEnvironment,
})
