import { describe, expect, it } from 'vitest'

import { kafkaConfigSchema } from '../index.mjs'

describe('queue configuration schemas', () => {
  it('should accept a Kafka retry factor between 0 and 1, the default included', () => {
    const parse = (factor: number) =>
      kafkaConfigSchema.safeParse({ type: 'kafka', brokers: ['b:9092'], retry: { factor } })

    expect(parse(0.2).success).toBe(true)
    expect(parse(0).success).toBe(true)
    expect(parse(1).success).toBe(true)
    expect(parse(1.5).success).toBe(false)
    expect(parse(-0.1).success).toBe(false)
  })
})
