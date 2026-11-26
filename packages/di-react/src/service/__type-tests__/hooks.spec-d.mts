import { Container, Factory, getInjectableToken, Injectable, InjectionToken } from '@navios/di'
import { describe, expectTypeOf, test } from 'vitest'
import { z } from 'zod/v4'

import type { FactoryContext } from '@navios/di'

import { useOptionalService } from '../use-optional-service.mjs'
import { useService } from '../use-service.mjs'
import { useSuspenseService } from '../use-suspense-service.mjs'

import type {
  ServiceHook,
  ServiceHookResults,
  UseOptionalServiceResult,
  UseServiceResult,
} from '../types.mjs'

@Injectable()
class Db {
  private readonly secret = 1
  query() {
    return this.secret
  }
}

@Injectable()
class WithAny {
  create(dto: any) {
    return String(dto)
  }
}

@Injectable()
class WithUnknown {
  create(dto: unknown) {
    return String(dto)
  }
}

@Factory()
class Connection {
  async create(_ctx?: FactoryContext) {
    return { end() {} }
  }
}

const schema = z.object({ id: z.string() })
const PLAIN = InjectionToken.create<{ a: 1 }>('plain')
const KEYED = InjectionToken.create<{ a: 1 }, typeof schema>('keyed', schema)

describe('hooks', () => {
  test('resolve a class to what the container does', () => {
    expectTypeOf(useService(Db).data).toEqualTypeOf<Db | undefined>()
    expectTypeOf(useService(WithAny).data).toEqualTypeOf<WithAny | undefined>()
    expectTypeOf(useOptionalService(WithUnknown).data).toEqualTypeOf<WithUnknown | undefined>()
    expectTypeOf(useSuspenseService(WithAny)).toEqualTypeOf<WithAny>()
    expectTypeOf(useService(Connection).data).toEqualTypeOf<{ end(): void } | undefined>()
    expectTypeOf(useOptionalService(Connection).data).toEqualTypeOf<{ end(): void } | undefined>()
    expectTypeOf(useSuspenseService(Connection)).toEqualTypeOf<{ end(): void }>()
    expectTypeOf(useService(Container).data).toEqualTypeOf<Container | undefined>()
  })

  test('accept a token whose schema is not known', () => {
    const token = getInjectableToken<Db>(Db)
    const annotated: InjectionToken<{ a: 1 }> = PLAIN
    expectTypeOf(useService(token).data).toEqualTypeOf<Db | undefined>()
    expectTypeOf(useOptionalService(token).data).toEqualTypeOf<Db | undefined>()
    expectTypeOf(useSuspenseService(token)).toEqualTypeOf<Db>()
    expectTypeOf(useService(annotated).data).toEqualTypeOf<{ a: 1 } | undefined>()
    expectTypeOf(useSuspenseService(PLAIN)).toEqualTypeOf<{ a: 1 }>()
  })

  test('still ask for the args of a token that requires them', () => {
    expectTypeOf(useService(KEYED, { id: '1' }).data).toEqualTypeOf<{ a: 1 } | undefined>()
    expectTypeOf(useSuspenseService(KEYED)).toExtend<string>()
    // @ts-expect-error the args are missing
    void useService(KEYED).data
    // @ts-expect-error the args are wrong
    useService(KEYED, { id: 1 })
  })

  test('name the result types', () => {
    expectTypeOf(useService(Db)).toEqualTypeOf<UseServiceResult<Db>>()
    expectTypeOf(useOptionalService(Db)).toEqualTypeOf<UseOptionalServiceResult<Db>>()
    expectTypeOf(useSuspenseService(Db)).toEqualTypeOf<Db>()
    expectTypeOf(useService(KEYED, { id: '1' })).toEqualTypeOf<UseServiceResult<{ a: 1 }>>()
    expectTypeOf(useOptionalService(PLAIN)).toEqualTypeOf<UseOptionalServiceResult<{ a: 1 }>>()
    expectTypeOf<ReturnType<typeof useService>>().toEqualTypeOf<UseServiceResult<unknown>>()
    expectTypeOf<ReturnType<typeof useSuspenseService>>().toEqualTypeOf<unknown>()
  })

  test('still ask for the args of a token that requires them in every hook', () => {
    expectTypeOf(useOptionalService(KEYED, { id: '1' }).data).toEqualTypeOf<{ a: 1 } | undefined>()
    expectTypeOf(useSuspenseService(KEYED, { id: '1' })).toEqualTypeOf<{ a: 1 }>()
    expectTypeOf(useOptionalService(KEYED)).toExtend<string>()
    // @ts-expect-error the args are wrong
    useOptionalService(KEYED, { id: 1 })
    // @ts-expect-error the args are wrong
    useSuspenseService(KEYED, { id: 1 })
  })

  test('type a hook of the same shape', () => {
    expectTypeOf(useService).toEqualTypeOf<ServiceHook<'service'>>()
    expectTypeOf(useOptionalService).toEqualTypeOf<ServiceHook<'optional'>>()
    expectTypeOf(useSuspenseService).toEqualTypeOf<ServiceHook<'suspense'>>()
    expectTypeOf<ServiceHookResults<Db>['service']>().toEqualTypeOf<UseServiceResult<Db>>()
  })
})
