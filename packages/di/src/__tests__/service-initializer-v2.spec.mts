import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { Container } from '../container/container.mjs'
import { Inject } from '../decorators/inject.decorator.mjs'
import { InjectDerived } from '../decorators/inject-derived.decorator.mjs'
import { InjectLazy } from '../decorators/inject-lazy.decorator.mjs'
import { InjectOptional } from '../decorators/inject-optional.decorator.mjs'
import { Injectable } from '../decorators/injectable.decorator.mjs'
import { InjectableScope } from '../enums/index.mjs'
import { DIError } from '../errors/index.mjs'
import { Registry } from '../token/registry.mjs'
import { Token } from '../token/token.mjs'

describe('ServiceInitializer v2 (one-pass metadata-driven resolution)', () => {
  let registry: Registry
  let container: Container

  beforeEach(() => {
    registry = new Registry()
    container = new Container(registry)
  })

  afterEach(async () => {
    await container.dispose()
  })

  it('constructs the service exactly once (no double-construct)', async () => {
    let constructCount = 0

    @Injectable({ registry })
    class Dep {
      readonly tag = 'dep'
    }

    @Injectable({ registry })
    class Service {
      @Inject(Dep) accessor dep!: Dep

      constructor() {
        constructCount++
      }
    }

    const service = await container.get(Service)
    expect(service).toBeInstanceOf(Service)
    expect(constructCount).toBe(1)
  })

  it('populates eager deps before onServiceInit runs', async () => {
    @Injectable({ registry })
    class Dep {
      readonly value = 42
    }

    let depAtInit: Dep | undefined

    @Injectable({ registry })
    class Service {
      @Inject(Dep) accessor dep!: Dep

      async onServiceInit() {
        depAtInit = this.dep
      }
    }

    const service = await container.get(Service)
    expect(service.dep).toBeInstanceOf(Dep)
    expect(depAtInit).toBe(service.dep)
    expect(depAtInit?.value).toBe(42)
  })

  it('lazy field is a Promise that resolves to the dep', async () => {
    @Injectable({ registry })
    class Dep {
      readonly value = 'lazy-dep'
    }

    @Injectable({ registry })
    class Service {
      @InjectLazy(Dep) accessor dep!: Promise<Dep>
    }

    const service = await container.get(Service)
    const resolved = await service.dep
    expect(resolved).toBeInstanceOf(Dep)
    expect(resolved.value).toBe('lazy-dep')
  })

  it('@InjectLazy breaks a pure mutual circular dependency', async () => {
    const ATok = Token.create<A>('cyc-A')
    const BTok = Token.create<B>('cyc-B')

    @Injectable({ registry, token: ATok })
    class A {
      @InjectLazy(BTok) accessor b!: Promise<B>
    }

    @Injectable({ registry, token: BTok })
    class B {
      @InjectLazy(ATok) accessor a!: Promise<A>
    }

    const a = await container.get(ATok)
    const b = await container.get(BTok)
    expect(await a.b).toBe(b)
    expect(await b.a).toBe(a)
  })

  it('optional missing dep resolves to null (settled before construction)', async () => {
    const MissingTok = Token.create<{ x: number }>('missing-optional')

    let optionalAtInit: unknown = 'unset'

    @Injectable({ registry })
    class Service {
      @InjectOptional(MissingTok) accessor maybe!: { x: number } | null

      onServiceInit() {
        optionalAtInit = this.maybe
      }
    }

    const service = await container.get(Service)
    expect(service.maybe).toBeNull()
    expect(optionalAtInit).toBeNull()
  })

  it('optional present dep resolves to the instance', async () => {
    @Injectable({ registry })
    class Dep {
      readonly value = 'present'
    }

    @Injectable({ registry })
    class Service {
      @InjectOptional(Dep) accessor maybe!: Dep | null
    }

    const service = await container.get(Service)
    expect(service.maybe).toBeInstanceOf(Dep)
  })

  it('derived dep args are computed from host args', async () => {
    const { z } = await import('zod/v4')
    const sizedSchema = z.object({ size: z.number() })
    const hostSchema = z.object({ id: z.number() })

    @Injectable({ registry, scope: InjectableScope.Transient, schema: sizedSchema })
    class Sized {
      constructor(public readonly args: { size: number }) {}
    }

    @Injectable({ registry, schema: hostSchema })
    class Service {
      @InjectDerived(Sized, (hostArgs: { id: number }) => ({ size: hostArgs.id * 2 }))
      accessor sized!: Sized

      constructor(public readonly hostArgs: { id: number }) {}
    }

    const service = await container.get(Service, { id: 5 })
    expect(service.sized).toBeInstanceOf(Sized)
    expect(service.sized.args).toEqual({ size: 10 })
  })

  it('runs onServiceInit and registers onServiceDestroy', async () => {
    const events: string[] = []

    @Injectable({ registry })
    class Service {
      async onServiceInit() {
        events.push('init')
      }

      async onServiceDestroy() {
        events.push('destroy')
      }
    }

    await container.get(Service)
    expect(events).toEqual(['init'])

    await container.dispose()
    expect(events).toEqual(['init', 'destroy'])
  })

  it('rejects with a DIError when an eager dependency cannot be resolved', async () => {
    const Missing = Token.create<{ x: number }>('missing-eager')

    @Injectable({ registry })
    class Svc {
      @Inject(Missing) accessor dep!: { x: number }
    }

    await expect(container.get(Svc)).rejects.toBeInstanceOf(DIError)
  })

  it('@InjectOptional yields null when the optional dep construction throws', async () => {
    @Injectable({ registry })
    class Broken {
      constructor() {
        throw new Error('boom')
      }
    }

    @Injectable({ registry })
    class Svc {
      @InjectOptional(Broken) accessor maybe!: Broken | null
    }

    const svc = await container.get(Svc)
    expect(svc.maybe).toBeNull()
  })
})
