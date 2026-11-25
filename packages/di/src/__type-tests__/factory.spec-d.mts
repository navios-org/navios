import { test } from 'vitest'
import { z } from 'zod/v4'

import { Factory } from '../decorators/index.mjs'
import { InjectableScope } from '../injectable-scope.mjs'
import { InjectionToken } from '../token/injection-token.mjs'

import type { Factorable, FactorableWithArgs } from '../provider/factorable.mjs'

// Test factory without arguments
@Factory()
class TestFactory1 implements Factorable<string> {
  create() {
    return 'test'
  }
}

// Test factory with scope
@Factory({ scope: InjectableScope.Transient })
class TestFactory2 implements Factorable<number> {
  create() {
    return 42
  }
}

// Test factory with token
const token = InjectionToken.create('TestToken')
@Factory({ token })
class TestFactory3 implements Factorable<boolean> {
  create() {
    return true
  }
}

// Test factory with token and schema
const schema = z.object({ name: z.string() })
const tokenWithSchema = InjectionToken.create<{ name: string }, typeof schema>(
  'TestTokenWithSchema',
  schema,
)
@Factory({ token: tokenWithSchema })
class TestFactory4 implements FactorableWithArgs<{ name: string }, typeof schema> {
  create(ctx: any, args: z.output<typeof schema>) {
    return args
  }
}

// Test factory with async create
@Factory()
class TestFactory6 implements Factorable<string[]> {
  async create() {
    return ['async', 'result']
  }
}

// Type tests - verify return types
const test1: string = new TestFactory1().create()
const test2: number = new TestFactory2().create()
const test3: boolean = new TestFactory3().create()
const test4: { name: string } = new TestFactory4().create(undefined, {
  name: 'test',
})
const test6: Promise<string[]> = new TestFactory6().create()

// Vitest 5 requires each spec-d file to register at least one test; the
// assertions above are enforced by the type checker.
test('factory return types', () => {})

export { test1, test2, test3, test4, test6 }
