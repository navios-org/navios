import { describe, expectTypeOf, it } from 'vitest'

import { Cron } from '../index.mjs'
import { Cron as LegacyCron } from '../legacy-compat/index.mjs'

import type { CronOptions } from '../index.mjs'

describe('@Cron', () => {
  it('should accept synchronous and asynchronous methods', () => {
    class TestService {
      @Cron('* * * * *')
      sync() {}

      @Cron('* * * * *')
      async asynchronous() {}
    }

    expectTypeOf(new TestService().sync).returns.toEqualTypeOf<void>()
    expectTypeOf(new TestService().asynchronous).returns.toEqualTypeOf<Promise<void>>()
  })

  it('should reject a method that takes arguments', () => {
    const decorator = Cron('* * * * *')
    const context = {} as ClassMethodDecoratorContext

    // @ts-expect-error a job is called without arguments
    decorator((value: string) => value.length, context)
  })

  it('should accept both kinds of method descriptors in the legacy decorator', () => {
    const decorator = LegacyCron('* * * * *')

    decorator({}, 'sync', {} as TypedPropertyDescriptor<() => void>)
    decorator({}, 'asynchronous', {} as TypedPropertyDescriptor<() => Promise<void>>)
  })

  it('should take a time zone', () => {
    expectTypeOf<CronOptions>().toHaveProperty('timeZone').toEqualTypeOf<string | undefined>()
  })
})
