import { describe, expectTypeOf, test, vi } from 'vitest'

import {
  Container,
  Factory,
  getInjectableToken,
  Injectable,
  InjectionToken,
  provide,
  registerProvider,
} from '../index.mjs'
import { TestContainer, UnitTestContainer } from '../testing/index.mjs'

import type { ClassType, FactoryContext } from '../index.mjs'
import type { ProviderConfig } from '../testing/index.mjs'

declare const container: Container
declare const tests: TestContainer

interface Config {
  mode: 'dev' | 'prod'
  retries?: number
  tags: ('x' | 'y')[]
  at: [string, number]
}

type Shape = { kind: 'circle'; radius: number } | { kind: 'square'; side: number }

@Injectable()
class Db {
  private readonly secret = 1
  query(sql: string): string {
    return sql + this.secret
  }
}

@Injectable()
class Payments {
  mode: 'live' | 'test' = 'live'

  async charge(_amount: number): Promise<{ status: 'ok' | 'failed'; tags: ('x' | 'y')[] }> {
    return { status: 'ok', tags: [] }
  }

  state(): 'open' | 'closed' {
    return 'open'
  }

  run(callback: (n: number) => void): { kind: 'ok' | 'bad' } {
    callback(1)
    return { kind: 'ok' }
  }
}

abstract class Repository {
  protected readonly table = 'rows'
  abstract find(id: string): Promise<'a' | 'b'>
}

@Factory()
class Connection {
  async create(_ctx?: FactoryContext) {
    return { pool: 1, query: (sql: string) => [sql] }
  }
}

class Generic<T> {
  value!: T
  set(value: T) {
    this.value = value
  }
}

class NotADb {
  foo = 1
}

const CONFIG = InjectionToken.create<Config>('config')
const SHAPE = InjectionToken.create<Shape>('shape')
const LITERAL = InjectionToken.create<'a' | 'b'>('literal')
const FN = InjectionToken.create<(n: number) => string>('fn')
const HANDLERS = InjectionToken.create<Array<(n: number) => void>>('handlers')
const GENERIC = InjectionToken.create<Generic<string>>('generic')
const MAP = InjectionToken.create<Map<string, number>>('map')
const NULLABLE = InjectionToken.create<string | null>('nullable')
const BOOLEAN = InjectionToken.create<boolean>('boolean')
const DB = InjectionToken.create<Db>('db')
const REPOSITORY = InjectionToken.create(Repository)

describe('literals', () => {
  test('a factory keeps them', () => {
    container.provide(CONFIG, { factory: () => ({ mode: 'dev', tags: ['x'], at: ['a', 1] }) })
    container.provide(CONFIG, { factory: async () => ({ mode: 'dev', tags: ['x'], at: ['a', 1] }) })
    registerProvider(CONFIG, { factory: () => ({ mode: 'dev', tags: ['x'], at: ['a', 1] }) })
    provide(CONFIG, {
      factory: async (ctx) => {
        void ctx
        return { mode: 'dev', tags: ['x'], at: ['a', 1] }
      },
    })
    provide(LITERAL, { factory: () => 'a' })
    provide(SHAPE, {
      factory: () =>
        Math.random() > 1 ? { kind: 'circle', radius: 1 } : { kind: 'square', side: 1 },
    })
    container.provide(Payments, {
      factory: () => ({
        mode: 'test',
        charge: async () => ({ status: 'ok', tags: ['x'] }),
        state: () => 'closed',
        run: () => ({ kind: 'ok' }),
      }),
    })
    tests.bind(CONFIG).toFactory(() => ({ mode: 'dev', tags: ['x'], at: ['a', 1] }))
    tests.bind(CONFIG).toFactory(async () => ({ mode: 'dev', tags: ['x'], at: ['a', 1] }))
    provide(MAP, { factory: () => new Map([['a', 1]]) })
    provide(MAP, { factory: () => new Map() })
    provide(GENERIC, { factory: () => new Generic() })
    provide(NULLABLE, { factory: () => null })
    provide(BOOLEAN, { factory: () => Math.random() > 1 })
  })

  test('a value keeps them, and its methods get their parameter types', () => {
    const payments = {
      charge: vi.fn(),
      state: vi.fn(),
      run: vi.fn(),
      mode: 'test' as const,
    }
    container.provide(CONFIG, { value: { mode: 'dev', tags: ['x'], at: ['a', 1] } })
    container.provide(Payments, {
      value: {
        mode: 'test',
        charge: async (amount) => ({ status: amount.toFixed() ? 'ok' : 'failed', tags: ['x'] }),
        state: () => 'open',
        run: (callback) => {
          callback(1)
          return { kind: 'ok' }
        },
      },
    })
    container.addInstance(Payments, {
      mode: 'test',
      charge: async () => ({ status: 'ok', tags: ['x'] }),
      state: () => 'open',
      run: (callback) => {
        callback(1)
        return { kind: 'ok' }
      },
    })
    container.createScope().addInstance(Payments, payments)
    container.addInstance(FN, (n) => n.toFixed())
    container.addInstance(SHAPE, { kind: 'square', side: 1 })
    provide(FN, { value: (n) => n.toFixed() })
    provide(FN, { factory: () => (n) => n.toFixed() })
    provide(HANDLERS, { value: [(n) => void n.toFixed()] })
    provide(GENERIC, { value: new Generic() })
    provide(GENERIC, Generic)
    tests.bind(Payments).toValue({
      mode: 'test',
      charge: async () => ({ status: 'ok', tags: ['x'] }),
      state: () => 'open',
      run: (callback) => {
        callback(1)
        return { kind: 'ok' }
      },
    })
    tests.bind(REPOSITORY).toFactory(() => ({ find: async (id) => (id ? 'a' : 'b') }))
  })

  test('a decorator keeps them', () => {
    container.decorate(Payments, (payments) => ({
      mode: 'test',
      charge: (amount) => payments.charge(amount),
      state: () => 'open',
      run: (callback) => payments.run(callback),
    }))
    container.decorate(CONFIG, (config) => ({ ...config, mode: 'prod' }))
    container.decorate(FN, (fn) => (n) => fn(n + 1))
  })

  test('a providers list accepts them', () => {
    new UnitTestContainer({
      providers: [
        { token: CONFIG, useFactory: () => ({ mode: 'dev', tags: ['x'], at: ['a', 1] }) },
        { token: CONFIG, useValue: { mode: 'dev', tags: ['x'], at: ['a', 1] } },
        {
          token: Payments,
          useValue: {
            mode: 'test',
            charge: async () => ({ status: 'ok', tags: ['x'] }),
            state: () => 'open',
            run: (callback) => {
              callback(1)
              return { kind: 'ok' }
            },
          },
        },
        {
          token: Payments,
          useFactory: () => ({
            mode: 'test',
            charge: async () => ({ status: 'ok', tags: ['x'] }),
            state: () => 'open',
            run: () => ({ kind: 'ok' }),
          }),
        },
        { token: SHAPE, useValue: { kind: 'circle', radius: 1 } },
        { token: SHAPE, useFactory: async () => ({ kind: 'square', side: 1 }) },
        { token: REPOSITORY, useFactory: () => ({ find: async () => 'a' }) },
        { token: Db, useFactory: () => new Db() },
        { token: Db, useFactory: async (ctx) => ctx.inject(Db) },
        { token: Db, useFactory: vi.fn() },
        { token: Db, useValue: { query: vi.fn() } },
        { token: MAP, useFactory: () => new Map([['a', 1]]) },
        { token: FN, useValue: (n) => n.toFixed() },
        { token: NULLABLE, useFactory: () => null },
        { token: BOOLEAN, useValue: true },
        { token: Connection, useValue: { pool: 2, query: () => [] } },
        { token: Connection, useFactory: () => ({ pool: 2, query: () => [] }) },
        { token: Connection, useClass: Connection },
      ],
    })
  })
})

describe('generic code', () => {
  test('may provide for a token', () => {
    function value<T>(token: InjectionToken<T>, given: T) {
      return provide(token, { value: given })
    }
    function instance<T>(token: InjectionToken<T>, given: T) {
      container.addInstance(token, given)
      container.createScope().addInstance(token, given)
    }
    function bind<T>(token: InjectionToken<T>, given: T) {
      tests.bind(token).toValue(given)
    }
    function factory<T>(token: InjectionToken<T>, given: () => T) {
      container.provide(token, { factory: given })
      registerProvider(token, { factory: given })
      tests.bind(token).toFactory(given)
      return provide(token, { factory: given })
    }
    function asyncFactory<T>(token: InjectionToken<T>, given: (ctx: FactoryContext) => Promise<T>) {
      return provide(token, { factory: given })
    }
    function implementation<T>(token: InjectionToken<T>, given: new (...args: any[]) => T) {
      provide(token, given)
      return provide(token, { class: given })
    }
    function listed<T>(token: InjectionToken<T>, given: T): ProviderConfig<T> {
      void new UnitTestContainer({ providers: [{ token, useValue: given }] })
      return { token, useValue: given }
    }
    function decorated<T>(token: InjectionToken<T>, wrap: (instance: T) => T) {
      container.decorate(token, wrap)
    }

    class Harness<T extends object> {
      constructor(
        private readonly token: InjectionToken<T>,
        private readonly given: T,
      ) {}

      start() {
        return new Container({ providers: [provide(this.token, { value: this.given })] })
      }
    }

    value(LITERAL, 'a')
    instance(CONFIG, { mode: 'dev', tags: [], at: ['a', 1] })
    bind(DB, new Db())
    factory(DB, () => new Db())
    asyncFactory(DB, async (ctx) => ctx.inject(Db))
    implementation(DB, Db)
    listed(DB, new Db())
    decorated(DB, (db) => db)
    new Harness(DB, new Db()).start()
  })

  test('may provide for a class', () => {
    function instance<T extends object>(target: new (...args: any[]) => T, given: T) {
      container.addInstance(target, given)
      tests.bind(target).toValue(given)
      void new UnitTestContainer({ providers: [{ token: target, useValue: given }] })
      return provide(target, { value: given })
    }
    function instanceOf<T extends ClassType>(target: T, given: InstanceType<T>) {
      container.addInstance(target, given)
    }
    function implementation<T extends object>(
      target: new (...args: any[]) => T,
      given: new (...args: any[]) => T,
    ) {
      void new UnitTestContainer({ providers: [{ token: target, useClass: given }] })
      return provide(target, given)
    }
    function mock<T extends object>(target: new (...args: any[]) => T, given: Partial<T>) {
      container.provide(target, { factory: () => given as T })
      registerProvider(target, { value: given as T })
    }

    instance(Db, new Db())
    instanceOf(Db, new Db())
    implementation(Db, Db)
    mock(Db, { query: () => '' })
  })

  test('may loop over untyped lists', () => {
    const values: [InjectionToken<any>, unknown][] = []
    for (const [token, value] of values) {
      container.provide(token, { value })
      container.addInstance(token, value)
      tests.bind(token).toValue(value)
    }
    const classes: [ClassType, unknown][] = []
    for (const [target, value] of classes) {
      container.provide(target, { value })
      container.addInstance(target, value)
      tests.bind(target).toValue(value)
    }
    const targets: (ClassType | InjectionToken<any, any>)[] = []
    for (const target of targets) {
      container.provide(target, NotADb)
    }
    const configs: ProviderConfig[] = []
    new UnitTestContainer({ providers: configs })
    new UnitTestContainer({ providers: [...configs, { token: Db }] })
  })
})

describe('what a class resolves to', () => {
  test('is provided for a factory class', () => {
    container.provide(Connection, { value: { pool: 1, query: (sql) => [sql] } })
    container.addInstance(Connection, { pool: 1, query: () => [] })
    tests.bind(Connection).toValue({ pool: 1, query: () => [] })
    tests.bind(Connection).toFactory(async () => ({ pool: 1, query: (sql) => [sql] }))
    tests.bind(Connection).toClass(Connection)
    // @ts-expect-error not what the factory produces
    tests.bind(Connection).toValue({ pool: 'one' })
  })

  test('is the public part of a class, also for a default provider', () => {
    @Injectable({ token: DB })
    class PublicDb {
      query(sql: string) {
        return sql
      }
    }

    container.provide(DB, PublicDb)
    expectTypeOf(registerProvider(Db, { value: new PublicDb() })).toEqualTypeOf<
      InjectionToken<Db, any>
    >()
    container.addInstance(getInjectableToken<Db>(Db), new PublicDb())
  })
})

describe('what is wrong', () => {
  class Animal {
    name = 'x'
  }
  class Dog extends Animal {
    bark() {}
  }
  const DOG = InjectionToken.create<Dog>('dog')

  test('is refused by provide()', () => {
    // @ts-expect-error not a Db
    provide(Db, { value: 42 })
    // @ts-expect-error not a Db
    provide(Db, NotADb)
    // @ts-expect-error not a Db
    provide(Db, { factory: () => 'x' })
    // @ts-expect-error not a Db
    provide(Db, { factory: () => ({}) })
    // @ts-expect-error not a Db
    provide(Db, { factory: async () => new NotADb() })
    // @ts-expect-error not a Db
    container.provide(DB, { factory: () => new NotADb() })
    // @ts-expect-error not a Db
    registerProvider(DB, { factory: async () => 42 })
    // @ts-expect-error not a Db
    registerProvider(Db, { factory: () => 'x' })
    // @ts-expect-error not a mode
    provide(CONFIG, { factory: () => ({ mode: 'nope', tags: [], at: ['a', 1] }) })
    // @ts-expect-error not a mode
    provide(CONFIG, { value: { mode: 'nope', tags: [], at: ['a', 1] } })
    // @ts-expect-error a supertype is not enough
    provide(DOG, { factory: () => new Animal() })
    // @ts-expect-error a supertype is not enough
    provide(DOG, { value: new Animal() })
    // @ts-expect-error a supertype is not enough
    provide(DOG, Animal)
    // @ts-expect-error a supertype is not enough
    container.provide(DOG, { factory: async () => ({ name: 'x' }) })
    // @ts-expect-error not a Db
    container.decorate(Db, () => 42)
  })

  test('is refused by addInstance()', () => {
    // @ts-expect-error not a Db
    container.addInstance(Db, 42)
    // @ts-expect-error not a Db
    container.addInstance(DB, 42)
    // @ts-expect-error not a Db
    container.createScope().addInstance(Db, 42)
  })

  test('is refused by the testing containers', () => {
    // @ts-expect-error not a Db
    tests.bind(Db).toFactory(() => 42)
    // @ts-expect-error a supertype is not enough
    tests.bind(DOG).toFactory(() => new Animal())
    // @ts-expect-error not a Db
    new UnitTestContainer({ providers: [{ token: Db, useValue: 42 }] })
    // @ts-expect-error not a Db
    new UnitTestContainer({ providers: [{ token: Db, useFactory: () => 42 }] })
    // @ts-expect-error not a Db
    new UnitTestContainer({ providers: [{ token: DB, useClass: NotADb }] })
    // @ts-expect-error not a status
    new UnitTestContainer({ providers: [{ token: Payments, useValue: { charge: () => 1 } }] })
  })
})

describe('what is not noticed', () => {
  test('a literal of the right kind in a providers list', () => {
    // TypeScript widens the list before it looks at the tokens.
    new UnitTestContainer({
      providers: [{ token: CONFIG, useValue: { mode: 'nope', tags: [], at: ['a', 1] } }],
    })
  })

  test('a factory in place of its product', () => {
    // Generic code cannot tell them apart.
    provide(Connection, { value: new Connection() })
  })
})
