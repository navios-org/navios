import { expectTypeOf, test } from 'vitest'
import { z } from 'zod/v4'

import { InjectableScope } from '../injectable-scope.mjs'
import { Factory, Injectable } from '../legacy-compat/index.mjs'
import { InjectionToken } from '../token/injection-token.mjs'

import type { FactoryContext } from '../provider/factory-context.mjs'

// A compiler with `experimentalDecorators` calls a class decorator with the
// class alone, which is how the decorators are applied here.

interface Mailer {
  send(to: string): void
}

const schema = z.object({ name: z.string() })
type Args = z.output<typeof schema>

test('legacy @Injectable returns the class it was given', () => {
  class Service {}
  expectTypeOf(Injectable()(Service)).toEqualTypeOf<typeof Service>()
  expectTypeOf(Injectable({ scope: InjectableScope.Request })(Service)).toEqualTypeOf<
    typeof Service
  >()
})

test('legacy @Injectable refuses a constructor argument without a schema', () => {
  class WithArgument {
    constructor(readonly args: Args) {}
  }
  // @ts-expect-error a class without a schema is built without arguments
  Injectable()(WithArgument)
})

test('legacy @Injectable checks the constructor against the schema', () => {
  class Named {
    constructor(readonly args: Args) {}
  }
  class Numbered {
    constructor(readonly args: { id: number }) {}
  }
  Injectable({ schema })(Named)
  // @ts-expect-error the constructor does not take what the schema makes
  Injectable({ schema })(Numbered)
})

test('legacy @Injectable checks the class against the type of the token', () => {
  const MAILER = InjectionToken.create<Mailer>('Mailer')
  class SesMailer implements Mailer {
    send(_to: string) {}
  }
  class NotAMailer {
    receive() {}
  }
  Injectable({ token: MAILER })(SesMailer)
  // @ts-expect-error the class is not a Mailer
  Injectable({ token: MAILER })(NotAMailer)
})

test('legacy @Injectable checks the constructor against the schema of the token', () => {
  const NAMED = InjectionToken.create<Mailer, typeof schema>('Named', schema)
  class NamedMailer implements Mailer {
    constructor(readonly args: Args) {}
    send(_to: string) {}
  }
  class NumberedMailer implements Mailer {
    constructor(readonly args: { id: number }) {}
    send(_to: string) {}
  }
  Injectable({ token: NAMED })(NamedMailer)
  // @ts-expect-error the constructor does not take what the schema makes
  Injectable({ token: NAMED })(NumberedMailer)
})

test('legacy @Factory wants a create() method', () => {
  class Maker {
    create() {
      return 'made'
    }
  }
  class NoMaker {}
  expectTypeOf(Factory()(Maker)).toEqualTypeOf<typeof Maker>()
  // @ts-expect-error there is no create()
  Factory()(NoMaker)
})

test('legacy @Factory checks what create() returns against the token', () => {
  const MAILER = InjectionToken.create<Mailer>('Mailer')
  class MailerFactory {
    create(): Mailer {
      return { send() {} }
    }
  }
  class StringFactory {
    create() {
      return 'not a mailer'
    }
  }
  Factory({ token: MAILER })(MailerFactory)
  // @ts-expect-error create() does not return a Mailer
  Factory({ token: MAILER })(StringFactory)
})

test('legacy @Factory checks the args of create() against the schema of the token', () => {
  const NAMED = InjectionToken.create<Mailer, typeof schema>('Named', schema)
  class NamedFactory {
    create(_ctx: FactoryContext | undefined, _args: Args): Mailer {
      return { send() {} }
    }
  }
  class NumberedFactory {
    create(_ctx: FactoryContext | undefined, _args: { id: number }): Mailer {
      return { send() {} }
    }
  }
  Factory({ token: NAMED })(NamedFactory)
  // @ts-expect-error create() does not take what the schema makes
  Factory({ token: NAMED })(NumberedFactory)
})
