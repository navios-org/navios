import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  Container,
  DIErrorCode,
  inject,
  Injectable,
  InjectableScope,
  InjectionToken,
} from '../index.mjs'

describe('scope', () => {
  let container: Container

  beforeEach(() => {
    container = new Container()
  })

  afterEach(async () => {
    await container.dispose()
  })

  it('rejects a singleton that injects a request-scoped service, naming the path', async () => {
    @Injectable({ scope: InjectableScope.Request })
    class RequestThing {}

    @Injectable()
    class SingletonThing {
      dep = inject(RequestThing)
    }

    const scope = container.createScope()
    for (const from of [container, scope]) {
      const error = await from.get(SingletonThing).catch((e) => e)
      expect(error.code).toBe(DIErrorCode.ScopeMismatchError)
      expect(error.message).toContain('SingletonThing -> RequestThing')
    }
    await scope.dispose()
  })

  it('rejects the same mismatch through a transient', async () => {
    @Injectable({ scope: InjectableScope.Request })
    class RequestThing {}

    @Injectable({ scope: InjectableScope.Transient })
    class Middle {
      dep = inject(RequestThing)
    }

    @Injectable()
    class SingletonThing {
      middle = inject(Middle)
    }

    const scope = container.createScope()
    const error = await scope.get(SingletonThing).catch((e) => e)
    expect(error.code).toBe(DIErrorCode.ScopeMismatchError)
    expect(error.message).toContain('SingletonThing -> Middle -> RequestThing')
    await scope.dispose()
  })

  it('rejects a request-scoped service from the root container', async () => {
    @Injectable({ scope: InjectableScope.Request })
    class RequestThing {}

    const error = await container.get(RequestThing).catch((e) => e)
    expect(error.code).toBe(DIErrorCode.ScopeMismatchError)
  })

  it('gives each scope its own request instances and shares singletons', async () => {
    @Injectable()
    class Shared {}

    @Injectable({ scope: InjectableScope.Request })
    class PerRequest {
      shared = inject(Shared)
    }

    const a = container.createScope()
    const b = container.createScope()
    const fromA = await a.get(PerRequest)
    const fromB = await b.get(PerRequest)
    expect(fromA).not.toBe(fromB)
    expect(fromA).toBe(await a.get(PerRequest))
    expect(fromA.shared).toBe(fromB.shared)
    expect(await container.get(Shared)).toBe(fromA.shared)
    await a.dispose()
    await b.dispose()
  })

  it('lets a transient resolved in a scope use request-scoped services', async () => {
    @Injectable({ scope: InjectableScope.Request })
    class PerRequest {}

    @Injectable({ scope: InjectableScope.Transient })
    class Transient {
      dep = inject(PerRequest)
    }

    const scope = container.createScope()
    const t1 = await scope.get(Transient)
    const t2 = scope.getSync(Transient)
    expect(t1).not.toBe(t2)
    expect(t1.dep).toBe(t2.dep)
    await scope.dispose()
  })

  it('supports a scope-only token supplied with addInstance', async () => {
    const RequestInfo = InjectionToken.create<{ url: string }>('RequestInfo', {
      scope: InjectableScope.Request,
    })

    @Injectable({ scope: InjectableScope.Request })
    class Reader {
      info = inject(RequestInfo)
    }

    const fromRoot = await container.get(RequestInfo).catch((e) => e)
    expect(fromRoot.code).toBe(DIErrorCode.ScopeMismatchError)

    const scope = container.createScope()
    scope.addInstance(RequestInfo, { url: '/a' })
    expect((await scope.get(Reader)).info.url).toBe('/a')

    const empty = container.createScope()
    const missing = await empty.get(Reader).catch((e) => e)
    expect(missing.code).toBe(DIErrorCode.ProviderNotFound)
    await scope.dispose()
    await empty.dispose()
  })

  it('keeps scope values out of singletons', async () => {
    const Value = InjectionToken.create<string>('Value')
    container.addInstance(Value, 'root')

    @Injectable()
    class Singleton {
      value = inject(Value)
    }

    const scope = container.createScope()
    scope.addInstance(Value, 'scoped')
    expect(await scope.get(Value)).toBe('scoped')
    expect((await scope.get(Singleton)).value).toBe('root')
    await scope.dispose()
  })

  it('disposes with await using and refuses use afterwards', async () => {
    let destroyed = 0

    @Injectable({ scope: InjectableScope.Request })
    class PerRequest {
      onServiceDestroy() {
        destroyed++
      }
    }

    let leaked: ReturnType<Container['createScope']>
    {
      await using scope = container.createScope()
      await scope.get(PerRequest)
      leaked = scope
    }
    expect(destroyed).toBe(1)
    const error = await leaked.get(PerRequest).catch((e) => e)
    expect(error.code).toBe(DIErrorCode.ContainerDisposed)
    expect(() => leaked.getSync(PerRequest)).toThrow(
      expect.objectContaining({ code: DIErrorCode.ContainerDisposed }),
    )
    await leaked.dispose()
    expect(destroyed).toBe(1)
  })

  it('stores and reads scope metadata', () => {
    const scope = container.createScope({ tenant: 'a' })
    expect(scope.getMetadata('tenant')).toBe('a')
    scope.setMetadata('user', 1)
    expect(scope.getMetadata('user')).toBe(1)
  })
})
