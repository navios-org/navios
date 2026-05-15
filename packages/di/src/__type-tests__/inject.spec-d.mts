// oxlint-disable no-unused-vars
import { expectTypeOf, test } from 'vitest'
import { z } from 'zod/v4'

import { Inject } from '../decorators/inject.decorator.mjs'
import { InjectDerived } from '../decorators/inject-derived.decorator.mjs'
import { InjectLazy } from '../decorators/inject-lazy.decorator.mjs'
import { InjectOptional } from '../decorators/inject-optional.decorator.mjs'
import {
  getInjections,
  InjectionKind,
} from '../decorators/injection-metadata.mjs'
import { Token } from '../token/token.mjs'

import type { InjectionEntry } from '../decorators/injection-metadata.mjs'

// The v1 `inject()` / `asyncInject()` / `optional()` resolver FUNCTIONS were
// removed in the v2 overhaul (Task 3.2). The v2 injection API is the four
// field decorators applied to `accessor` members. This file type-tests those
// decorators and the injection-metadata surface.

interface FooService {
  makeFoo(): string
}

const fooToken = Token.create<FooService>('FooService')
const schema = z.object({ foo: z.string() })
const schemaToken = Token.create<FooService, typeof schema>('FooServiceWithSchema', schema)

test('@Inject is an accessor decorator producing a value/void result', () => {
  class Service {
    @Inject(fooToken) accessor foo!: FooService
  }
  expectTypeOf(new Service().foo).toEqualTypeOf<FooService>()

  // @Inject also accepts a bare class and optional args.
  class Dep {}
  class WithClassDep {
    @Inject(Dep) accessor dep!: Dep
  }
  expectTypeOf(new WithClassDep().dep).toEqualTypeOf<Dep>()

  // Schema-bearing token + args.
  class WithArgs {
    @Inject(schemaToken, { foo: 'bar' }) accessor svc!: FooService
  }
  expectTypeOf(new WithArgs().svc).toEqualTypeOf<FooService>()
})

test('@InjectLazy targets a Promise-typed accessor', () => {
  class Service {
    @InjectLazy(fooToken) accessor foo!: Promise<FooService>
  }
  expectTypeOf(new Service().foo).toEqualTypeOf<Promise<FooService>>()
})

test('@InjectOptional targets a nullable accessor', () => {
  class Service {
    @InjectOptional(fooToken) accessor foo!: FooService | null
  }
  expectTypeOf(new Service().foo).toEqualTypeOf<FooService | null>()
})

test('@InjectDerived takes a derive callback and targets the dependency type', () => {
  interface HostArgs {
    size: number
  }
  class Service {
    @InjectDerived<FooService, HostArgs>(schemaToken, (hostArgs) => {
      expectTypeOf(hostArgs).toEqualTypeOf<HostArgs>()
      return { foo: String(hostArgs.size) }
    })
    accessor foo!: FooService
  }
  expectTypeOf(new Service().foo).toEqualTypeOf<FooService>()
})

test('decorator factories return an accessor decorator', () => {
  const dec = Inject(fooToken)
  expectTypeOf(dec).toBeFunction()
  expectTypeOf(dec).parameter(1).toMatchTypeOf<ClassAccessorDecoratorContext<unknown, unknown>>()
})

test('getInjections returns readonly InjectionEntry[]', () => {
  class Service {
    @Inject(fooToken) accessor foo!: FooService
  }
  const entries = getInjections(Service)
  expectTypeOf(entries).toEqualTypeOf<readonly InjectionEntry[]>()
})

test('InjectionKind is the discriminant enum', () => {
  expectTypeOf(InjectionKind).toHaveProperty('Eager')
  expectTypeOf(InjectionKind).toHaveProperty('Lazy')
  expectTypeOf(InjectionKind).toHaveProperty('Optional')
  expectTypeOf(InjectionKind).toHaveProperty('Derived')

  // InjectionEntry is a discriminated union keyed by `kind`; narrowing on
  // Derived exposes the `derive` callback only.
  const entry = {} as InjectionEntry
  if (entry.kind === InjectionKind.Derived) {
    expectTypeOf(entry.derive).toEqualTypeOf<(hostArgs: unknown) => unknown>()
  } else if (entry.kind === InjectionKind.Eager) {
    expectTypeOf(entry).toHaveProperty('token')
    expectTypeOf(entry).not.toHaveProperty('derive')
  }
})
