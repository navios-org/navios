import { describe, expectTypeOf, test } from 'vitest'
import { z } from 'zod/v4'

import {
  asyncInject,
  Container,
  Factory,
  inject,
  Injectable,
  InjectionToken,
  optional,
  provide,
  registerProvider,
  ScopedContainer,
} from '../index.mjs'
import { TestContainer, UnitTestContainer } from '../testing/index.mjs'

import type { FactoryContext, ProviderInfo, ResolvedInstance } from '../index.mjs'

declare const container: Container
declare const ctx: FactoryContext

interface Order {
  id: string
}

@Injectable()
class Db {
  query() {
    return 1
  }
}

@Injectable()
class Mailer {
  private readonly db = inject(Db)

  send(to: string): void {
    this.db.query()
    void to
  }
}

class NotAMailer {
  foo = 1
}

class FakeMailer {
  send(_to: string) {}
}

const MAILER = InjectionToken.create<Mailer>('Mailer')
const schema = z.object({ id: z.string() })

@Factory()
class ConnectionFactory {
  create(_ctx?: FactoryContext) {
    return Promise.resolve({ x: 1 })
  }
}

describe('a create() method of an ordinary service', () => {
  // Only `create()` without parameters, or with a FactoryContext first, makes
  // a class a factory as far as types go.
  @Injectable()
  class WithAny {
    create(_data: any): Promise<Order> {
      return null as any
    }
  }

  @Injectable()
  class WithUnknown {
    create(_data: unknown): Order {
      return null as any
    }
  }

  @Injectable()
  class WithObject {
    create(_data: object): Order {
      return null as any
    }
  }

  @Injectable()
  class WithDto {
    create(_data?: Partial<Order>): Order {
      return null as any
    }
  }

  @Injectable()
  class WithGeneric {
    create<T>(data: T): T {
      return data
    }
  }

  @Injectable()
  class WithRest {
    create(..._args: any[]): Order {
      return null as any
    }
  }

  test('does not make it a factory', () => {
    expectTypeOf(inject(WithAny)).toEqualTypeOf<WithAny>()
    expectTypeOf(inject(WithUnknown)).toEqualTypeOf<WithUnknown>()
    expectTypeOf(inject(WithObject)).toEqualTypeOf<WithObject>()
    expectTypeOf(inject(WithDto)).toEqualTypeOf<WithDto>()
    expectTypeOf(inject(WithGeneric)).toEqualTypeOf<WithGeneric>()
    expectTypeOf(inject(WithRest)).toEqualTypeOf<WithRest>()
    expectTypeOf(container.get(WithAny)).toEqualTypeOf<Promise<WithAny>>()
    expectTypeOf(optional(WithUnknown)).toEqualTypeOf<WithUnknown | null>()
    expectTypeOf(asyncInject(WithGeneric)).toEqualTypeOf<Promise<WithGeneric>>()
  })

  test('makes it one with a FactoryContext, or without parameters', () => {
    expectTypeOf(inject(ConnectionFactory)).toEqualTypeOf<{ x: number }>()
    expectTypeOf(container.get(ConnectionFactory)).toEqualTypeOf<Promise<{ x: number }>>()
    expectTypeOf<ResolvedInstance<typeof ConnectionFactory>>().toEqualTypeOf<{ x: number }>()

    @Factory()
    class NoParameters {
      create() {
        return 'value'
      }
    }
    expectTypeOf(inject(NoParameters)).toEqualTypeOf<string>()
  })
})

describe('provide()', () => {
  test('accepts what has the public members of the class', () => {
    provide(Mailer, FakeMailer)
    provide(Mailer, { value: { send() {} } })
    provide(Mailer, { class: FakeMailer })
    provide(Mailer, { factory: () => new FakeMailer() })
    provide(Mailer, { factory: async () => new Mailer() })
    provide(MAILER, FakeMailer)
    provide(MAILER, { existing: Mailer })
    provide(MAILER, { existing: FakeMailer })
    provide(Mailer, { existing: MAILER })
    provide(ConnectionFactory, { value: { x: 2 } })
    provide(InjectionToken.create<{ x: number }>('connection'), ConnectionFactory)
    provide(InjectionToken.create<(a: number) => string>('fn'), { value: String })
    provide(InjectionToken.create<string>('s'), { value: 's' })
  })

  test('rejects anything else', () => {
    // @ts-expect-error not a Mailer
    provide(Mailer, { value: 42 })
    // @ts-expect-error not a Mailer
    provide(Mailer, NotAMailer)
    // @ts-expect-error not a Mailer
    provide(Mailer, { class: NotAMailer })
    // @ts-expect-error not a Mailer
    provide(Mailer, { factory: () => 'x' })
    // @ts-expect-error not a Mailer
    provide(Mailer, { existing: Db })
    // @ts-expect-error not a Mailer
    provide(MAILER, NotAMailer)
    // @ts-expect-error not a Mailer
    provide(MAILER, { class: NotAMailer })
    // @ts-expect-error not a Mailer
    provide(MAILER, { value: 42 })
    // @ts-expect-error not a Mailer
    provide(MAILER, { existing: Db })
    // @ts-expect-error the factory provides its product, not itself
    provide(ConnectionFactory, { value: { x: 'two' } })
  })

  test('is checked on the container as well', () => {
    container.provide(Mailer, FakeMailer)
    // @ts-expect-error not a Mailer
    container.provide(Mailer, NotAMailer)
    container.addInstance(Mailer, { send() {} })
    container.addInstance(MAILER, new FakeMailer())
    // @ts-expect-error not a Mailer
    container.addInstance(Mailer, 42)
    // @ts-expect-error not a Mailer
    container.addInstance(MAILER, 42)
    // @ts-expect-error not a Mailer
    container.createScope().addInstance(Mailer, 42)
    expectTypeOf(container.getProvider(Mailer)).toEqualTypeOf<ProviderInfo | undefined>()
  })

  test('has a counterpart for defaults', () => {
    expectTypeOf(registerProvider(MAILER, { value: new FakeMailer() })).toEqualTypeOf<
      typeof MAILER
    >()
    registerProvider(MAILER, { factory: async (c) => c.inject(Mailer) })
    // @ts-expect-error not a Mailer
    registerProvider(MAILER, { value: 42 })
  })
})

describe('tokens', () => {
  test('of different types are different types', () => {
    const numbers = InjectionToken.create<number>('n')
    // @ts-expect-error a token of a number is not a token of a string
    const strings: InjectionToken<string> = numbers
    void strings

    const withSchema = InjectionToken.create<number, typeof schema>('n', schema)
    // @ts-expect-error the args differ
    const other: InjectionToken<number, z.ZodString> = withSchema
    void other
  })

  test('keep working when only their value type is written down', () => {
    const plain: InjectionToken<number> = InjectionToken.create<number>('n')
    expectTypeOf(inject(plain)).toEqualTypeOf<number>()
    expectTypeOf(container.get(plain)).toEqualTypeOf<Promise<number>>()
    expectTypeOf(optional(plain)).toEqualTypeOf<number | null>()
    container.addInstance(plain, 1)
    const any: InjectionToken<any, any> = plain
    void any
  })

  test('can be named after an abstract class', () => {
    abstract class Repository {
      abstract find(): string
    }

    class SqlRepository extends Repository {
      find() {
        return ''
      }
    }

    const REPOSITORY = InjectionToken.create(Repository)
    expectTypeOf(inject(REPOSITORY)).toEqualTypeOf<Repository>()
    provide(REPOSITORY, SqlRepository)
  })
})

describe('resolving', () => {
  test('ctx.inject() is typed like container.get()', () => {
    expectTypeOf(ctx.inject(Mailer)).toEqualTypeOf<Promise<Mailer>>()
    expectTypeOf(ctx.inject(MAILER)).toEqualTypeOf<Promise<Mailer>>()
    expectTypeOf(ctx.inject(ConnectionFactory)).toEqualTypeOf<Promise<{ x: number }>>()
  })

  test('optional() takes the args of a class', () => {
    @Injectable({ schema })
    class WithArgs {
      constructor(public readonly args: z.output<typeof schema>) {}
    }

    expectTypeOf(optional(WithArgs, { id: '1' })).toEqualTypeOf<WithArgs | null>()
    // @ts-expect-error the args are missing
    optional(WithArgs)
    // @ts-expect-error the args are missing
    inject(WithArgs)
  })

  test('an instance is not a reference', () => {
    // @ts-expect-error a factory instance is not a token
    inject(new ConnectionFactory(), { id: 'x' })
    // @ts-expect-error a factory instance is not a token
    void container.get(new ConnectionFactory(), { id: 'x' })
  })

  test('peek() is inferred', () => {
    expectTypeOf(container.peek(Mailer)).toEqualTypeOf<Mailer | null>()
    expectTypeOf(container.peek(MAILER)).toEqualTypeOf<Mailer | null>()
    expectTypeOf(container.createScope().peek(ConnectionFactory)).toEqualTypeOf<{
      x: number
    } | null>()
  })

  test('the current scope', () => {
    expectTypeOf(inject(ScopedContainer)).toEqualTypeOf<ScopedContainer>()
    expectTypeOf(optional(ScopedContainer)).toEqualTypeOf<ScopedContainer | null>()
    expectTypeOf(container.createScope().get(ScopedContainer)).toEqualTypeOf<
      Promise<ScopedContainer>
    >()
  })

  test('decorate() gets what the class resolves to', () => {
    container.decorate(ConnectionFactory, (connection) => {
      expectTypeOf(connection).toEqualTypeOf<{ x: number }>()
      return connection
    })
    container.decorate(Mailer, (mailer) => mailer)
  })
})

describe('testing containers', () => {
  test('check what is bound', () => {
    const container = new TestContainer()
    container.bind(Mailer).toValue({ send() {} })
    container.bind(Mailer).toClass(FakeMailer)
    container.bind(MAILER).toFactory((c) => c.inject(Mailer))
    // @ts-expect-error not a Mailer
    container.bind(Mailer).toValue(42)
    // @ts-expect-error not a Mailer
    container.bind(Mailer).toClass(NotAMailer)
  })

  test('check the providers list', () => {
    const unit = new UnitTestContainer({
      providers: [
        { token: Mailer, useValue: { send() {} } },
        { token: MAILER, useClass: FakeMailer },
        { token: Db },
        { token: InjectionToken.create<number>('n'), useFactory: () => 1 },
      ],
    })
    expectTypeOf(unit).toExtend<Container>()
    new UnitTestContainer({ providers: [] })
    // @ts-expect-error not a Mailer
    new UnitTestContainer({ providers: [{ token: Mailer, useValue: 42 }] })
    // @ts-expect-error not a Mailer
    new UnitTestContainer({ providers: [{ token: Db }, { token: MAILER, useClass: NotAMailer }] })
  })
})
