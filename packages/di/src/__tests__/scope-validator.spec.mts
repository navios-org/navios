import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { Container } from '../container/container.mjs'
import { Inject } from '../decorators/inject.decorator.mjs'
import { InjectDerived } from '../decorators/inject-derived.decorator.mjs'
import { InjectLazy } from '../decorators/inject-lazy.decorator.mjs'
import { InjectOptional } from '../decorators/inject-optional.decorator.mjs'
import { Injectable } from '../decorators/injectable.decorator.mjs'
import { InjectableScope } from '../enums/index.mjs'
import { DIError, DIErrorCode } from '../errors/index.mjs'
import { Registry } from '../token/registry.mjs'

async function captureError(p: Promise<unknown>): Promise<DIError> {
  try {
    await p
  } catch (e) {
    return e as DIError
  }
  throw new Error('expected the promise to reject, but it resolved')
}

describe('Scope compatibility validation (fail-fast)', () => {
  let registry: Registry
  let container: Container

  beforeEach(() => {
    registry = new Registry()
    container = new Container({ registry })
  })

  afterEach(async () => {
    await container.dispose()
  })

  it('throws DIError when a Singleton has an EAGER @Inject on a Request-scoped dep', async () => {
    @Injectable({ registry, scope: InjectableScope.Request })
    class RequestSvc {
      readonly tag = 'req'
    }

    @Injectable({ registry, scope: InjectableScope.Singleton })
    class Host {
      @Inject(RequestSvc) accessor dep!: RequestSvc
    }

    await expect(container.get(Host)).rejects.toThrow(DIError)
    await expect(container.get(Host)).rejects.toMatchObject({
      code: DIErrorCode.ScopeIncompatible,
    })
    const error = await captureError(container.get(Host))
    expect(error).toBeInstanceOf(DIError)
    expect(error.message).toContain('Host')
    expect(error.message).toContain('RequestSvc')
    expect(error.message).toContain('Singleton')
    expect(error.message).toContain('Request')
    expect(error.message).toContain('@InjectLazy')
  })

  it('does NOT throw the scope error when the Request dep is @InjectLazy', async () => {
    @Injectable({ registry, scope: InjectableScope.Request })
    class RequestSvc {
      readonly tag = 'req'
    }

    @Injectable({ registry, scope: InjectableScope.Singleton })
    class Host {
      @InjectLazy(RequestSvc) accessor dep!: Promise<RequestSvc>
    }

    // Lazy Request dep: resolve through a request scope (the valid v2 way to
    // touch anything Request-scoped). The scope check must NOT fire (lazy is
    // the documented escape hatch), so the Host constructs.
    const scoped = container.beginRequest('lazy-req-1')
    const host = await scoped.get(Host)
    expect(host).toBeInstanceOf(Host)
    await scoped.endRequest()
  })

  it('does NOT throw the scope error when the Request dep is @InjectOptional', async () => {
    @Injectable({ registry, scope: InjectableScope.Request })
    class RequestSvc {
      readonly tag = 'req'
    }

    @Injectable({ registry, scope: InjectableScope.Singleton })
    class Host {
      @InjectOptional(RequestSvc) accessor dep!: RequestSvc | null
    }

    const host = await container.get(Host)
    expect(host).toBeInstanceOf(Host)
  })

  it('throws scopeMismatch when a Singleton has an EAGER @Inject on a Transient dep', async () => {
    @Injectable({ registry, scope: InjectableScope.Transient })
    class TransientSvc {
      readonly tag = 'transient'
    }

    @Injectable({ registry, scope: InjectableScope.Singleton })
    class Host {
      @Inject(TransientSvc) accessor dep!: TransientSvc
    }

    const error = await captureError(container.get(Host))
    expect(error).toBeInstanceOf(DIError)
    expect(error.code).toBe(DIErrorCode.ScopeIncompatible)
    expect(error.message).toContain('Host')
    expect(error.message).toContain('TransientSvc')
    expect(error.message).toContain('Transient')
    expect(error.message).toContain('@InjectLazy')
  })

  it('does NOT throw when a Singleton has an EAGER @Inject on another Singleton', async () => {
    @Injectable({ registry, scope: InjectableScope.Singleton })
    class OtherSingleton {
      readonly tag = 'singleton'
    }

    @Injectable({ registry, scope: InjectableScope.Singleton })
    class Host {
      @Inject(OtherSingleton) accessor dep!: OtherSingleton
    }

    const host = await container.get(Host)
    expect(host).toBeInstanceOf(Host)
    expect(host.dep).toBeInstanceOf(OtherSingleton)
  })

  it('does NOT throw when a Request host depends eagerly on a Request dep or a Singleton', async () => {
    @Injectable({ registry, scope: InjectableScope.Request })
    class RequestDep {
      readonly tag = 'req-dep'
    }

    @Injectable({ registry, scope: InjectableScope.Singleton })
    class SingletonDep {
      readonly tag = 'singleton-dep'
    }

    @Injectable({ registry, scope: InjectableScope.Request })
    class RequestHost {
      @Inject(RequestDep) accessor reqDep!: RequestDep
      @Inject(SingletonDep) accessor singletonDep!: SingletonDep
    }

    const scoped = container.beginRequest('req-1')
    const host = await scoped.get(RequestHost)
    expect(host).toBeInstanceOf(RequestHost)
    expect(host.reqDep).toBeInstanceOf(RequestDep)
    expect(host.singletonDep).toBeInstanceOf(SingletonDep)
    await scoped.endRequest()
  })

  it('memoizes the check: resolving the same valid Host twice both succeed', async () => {
    @Injectable({ registry, scope: InjectableScope.Singleton })
    class Dep {
      readonly tag = 'dep'
    }

    @Injectable({ registry, scope: InjectableScope.Singleton })
    class Host {
      @Inject(Dep) accessor dep!: Dep
    }

    const first = await container.get(Host)
    const second = await container.get(Host)
    expect(first).toBe(second)
    expect(second).toBeInstanceOf(Host)
  })

  it('throws when @InjectDerived (eager) on a Request dep from a Singleton', async () => {
    @Injectable({ registry, scope: InjectableScope.Request })
    class RequestSvc {
      readonly tag = 'req'
    }

    @Injectable({ registry, scope: InjectableScope.Singleton })
    class Host {
      @InjectDerived(RequestSvc, () => undefined) accessor dep!: RequestSvc
    }

    const error = await captureError(container.get(Host))
    expect(error).toBeInstanceOf(DIError)
    expect(error.code).toBe(DIErrorCode.ScopeIncompatible)
    expect(error.message).toContain('Host')
    expect(error.message).toContain('RequestSvc')
  })

  it('does NOT throw scopeMismatch when an eager dep is unregistered (normal not-found path applies)', async () => {
    @Injectable({ registry: new Registry() })
    class Unregistered {
      readonly tag = 'unregistered'
    }

    @Injectable({ registry, scope: InjectableScope.Singleton })
    class Host {
      @Inject(Unregistered) accessor dep!: Unregistered
    }

    const error = await captureError(container.get(Host))
    expect(error).toBeInstanceOf(DIError)
    expect(error.code).not.toBe(DIErrorCode.ScopeIncompatible)
  })
})
