/**
 * Tests for the explicit opt-in ScopedContainer.resolveInScope API.
 *
 * resolveInScope resolves a token treating its effective host scope as
 * Request for THIS resolution only, within THIS ScopedContainer's request
 * scope. It is the deliberate, non-mutating, race-free successor to the
 * deleted v1 implicit Singleton -> Request scope-upgrade.
 *
 * Contract under test:
 * 1. A Singleton-declared class eagerly @Inject-ing a Request dep throws
 *    ScopeIncompatibleError via container.get(), but resolveInScope resolves.
 * 2. Zero global mutation: the registered scope is unchanged; plain get()
 *    elsewhere still gets declared-scope behavior.
 * 3. Validator passes by construction (host treated as Request).
 * 4. Idempotent within a request; isolated across requests.
 * 5. Transitive deps keep their declared scope.
 * 6. Real resolver/lifecycle/plugin path (onServiceInit/onServiceDestroy,
 *    plugin onAfterCreate).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { Container } from '../container/container.mjs'
import { Inject } from '../decorators/inject.decorator.mjs'
import { Injectable } from '../decorators/injectable.decorator.mjs'
import { InjectableScope } from '../enums/index.mjs'
import { DIError, DIErrorCode } from '../errors/index.mjs'
import { definePlugin } from '../plugin/index.mjs'
import { Registry } from '../token/registry.mjs'

import type { CreateContext } from '../plugin/index.mjs'
import type { OnServiceDestroy, OnServiceInit } from '../interfaces/index.mjs'

describe('ScopedContainer.resolveInScope', () => {
  let registry: Registry
  let container: Container

  beforeEach(() => {
    registry = new Registry()
    container = new Container({ registry })
  })

  afterEach(async () => {
    await container.dispose()
  })

  it('resolves a Singleton host eagerly depending on a Request dep that container.get() rejects', async () => {
    @Injectable({ registry, scope: InjectableScope.Request })
    class ReqSvc {
      readonly tag = 'req'
    }

    @Injectable({ registry, scope: InjectableScope.Singleton })
    class Ctrl {
      @Inject(ReqSvc) accessor reqSvc!: ReqSvc
    }

    // The v2 fail-fast still holds for normal resolution.
    await expect(container.get(Ctrl)).rejects.toMatchObject({
      code: DIErrorCode.ScopeIncompatibleError,
    })

    const s = container.beginRequest('r1')
    const ctrl = await s.resolveInScope(Ctrl)
    expect(ctrl).toBeInstanceOf(Ctrl)
    expect(ctrl.reqSvc).toBeInstanceOf(ReqSvc)
    expect(ctrl.reqSvc.tag).toBe('req')

    // The request-scoped dep is the SAME instance the request would resolve.
    const reqDirect = await s.get(ReqSvc)
    expect(ctrl.reqSvc).toBe(reqDirect)

    await s.endRequest()
  })

  it('is idempotent within a single request', async () => {
    @Injectable({ registry, scope: InjectableScope.Request })
    class ReqSvc {}

    @Injectable({ registry, scope: InjectableScope.Singleton })
    class Ctrl {
      @Inject(ReqSvc) accessor reqSvc!: ReqSvc
    }

    const s = container.beginRequest('r1')
    const a = await s.resolveInScope(Ctrl)
    const b = await s.resolveInScope(Ctrl)
    expect(a).toBe(b)
    await s.endRequest()
  })

  it('isolates instances across different requests', async () => {
    @Injectable({ registry, scope: InjectableScope.Request })
    class ReqSvc {}

    @Injectable({ registry, scope: InjectableScope.Singleton })
    class Ctrl {
      @Inject(ReqSvc) accessor reqSvc!: ReqSvc
    }

    const s1 = container.beginRequest('a')
    const s2 = container.beginRequest('b')
    const c1 = await s1.resolveInScope(Ctrl)
    const c2 = await s2.resolveInScope(Ctrl)
    expect(c1).not.toBe(c2)
    expect(c1.reqSvc).not.toBe(c2.reqSvc)
    await s1.endRequest()
    await s2.endRequest()
  })

  it('does NOT mutate the global registry or singleton storage', async () => {
    @Injectable({ registry, scope: InjectableScope.Singleton })
    class SingletonOnly {
      readonly id = Math.random()
    }

    const s = container.beginRequest('r1')
    const reqInstance = await s.resolveInScope(SingletonOnly)

    // Plain get() still yields the process-singleton, DISTINCT from request one.
    const globalInstance = await container.get(SingletonOnly)
    expect(globalInstance).not.toBe(reqInstance)

    // Registered scope unchanged: two plain gets are the same singleton.
    const globalAgain = await container.get(SingletonOnly)
    expect(globalAgain).toBe(globalInstance)

    // Registry record scope unchanged.
    const realToken = container.internals.tokenResolver.getRegistryToken(SingletonOnly)
    expect(registry.get(realToken).scope).toBe(InjectableScope.Singleton)

    await s.endRequest()
  })

  it('keeps transitive deps at their declared scope', async () => {
    @Injectable({ registry, scope: InjectableScope.Singleton })
    class SharedSingleton {
      readonly tag = 'shared'
    }

    @Injectable({ registry, scope: InjectableScope.Request })
    class ReqDep {}

    @Injectable({ registry, scope: InjectableScope.Singleton })
    class Ctrl {
      @Inject(SharedSingleton) accessor shared!: SharedSingleton
      @Inject(ReqDep) accessor reqDep!: ReqDep
    }

    const s = container.beginRequest('r1')
    const ctrl = await s.resolveInScope(Ctrl)

    // Singleton dep is the SAME shared process-singleton.
    const sharedGlobal = await container.get(SharedSingleton)
    expect(ctrl.shared).toBe(sharedGlobal)

    // Request dep is this request's instance.
    const reqDirect = await s.get(ReqDep)
    expect(ctrl.reqDep).toBe(reqDirect)

    await s.endRequest()
  })

  it('disposes resolveInScope instances on endRequest (onServiceDestroy)', async () => {
    let destroyed = false

    @Injectable({ registry, scope: InjectableScope.Singleton })
    class Disposable implements OnServiceDestroy {
      async onServiceDestroy(): Promise<void> {
        destroyed = true
      }
    }

    const s = container.beginRequest('r1')
    await s.resolveInScope(Disposable)
    expect(destroyed).toBe(false)
    await s.endRequest()
    expect(destroyed).toBe(true)
  })

  it('is concurrency-safe across two ScopedContainers', async () => {
    @Injectable({ registry, scope: InjectableScope.Request })
    class ReqSvc {}

    @Injectable({ registry, scope: InjectableScope.Singleton })
    class Ctrl {
      @Inject(ReqSvc) accessor reqSvc!: ReqSvc
    }

    const s1 = container.beginRequest('a')
    const s2 = container.beginRequest('b')
    const [c1, c2] = await Promise.all([
      s1.resolveInScope(Ctrl),
      s2.resolveInScope(Ctrl),
    ])
    expect(c1).not.toBe(c2)
    expect(c1.reqSvc).not.toBe(c2.reqSvc)
    await Promise.all([s1.endRequest(), s2.endRequest()])
  })

  it('runs onServiceInit and plugin onAfterCreate for the resolveInScope instance', async () => {
    let initRan = false
    const seen: unknown[] = []

    container.use(
      definePlugin({
        name: 'observer',
        onAfterCreate(_ctx: CreateContext, instance: unknown) {
          seen.push(instance)
        },
      }),
    )

    @Injectable({ registry, scope: InjectableScope.Singleton })
    class Ctrl implements OnServiceInit {
      async onServiceInit(): Promise<void> {
        initRan = true
      }
    }

    const s = container.beginRequest('r1')
    const ctrl = await s.resolveInScope(Ctrl)
    expect(initRan).toBe(true)
    expect(seen).toContain(ctrl)
    await s.endRequest()
  })

  it('rejects resolveInScope after endRequest (scope has been ended/disposed)', async () => {
    @Injectable({ registry, scope: InjectableScope.Singleton })
    class Ctrl {}

    const s = container.beginRequest('r1')
    // First resolution works while the request scope is live.
    await s.resolveInScope(Ctrl)

    await s.endRequest()

    // endRequest() disposes the scoped container, so a subsequent
    // resolveInScope must reject — the request scope no longer exists.
    await expect(s.resolveInScope(Ctrl)).rejects.toThrow(
      'ScopedContainer has been disposed',
    )
  })

  it('container.get(Ctrl) STILL throws ScopeIncompatibleError after resolveInScope (validator memo not poisoned)', async () => {
    @Injectable({ registry, scope: InjectableScope.Request })
    class ReqSvc {}

    @Injectable({ registry, scope: InjectableScope.Singleton })
    class Ctrl {
      @Inject(ReqSvc) accessor reqSvc!: ReqSvc
    }

    const s = container.beginRequest('r1')
    await s.resolveInScope(Ctrl)
    await s.endRequest()

    // Validator memo must NOT have been poisoned by the Request-host path.
    const err = await container
      .get(Ctrl)
      .then(() => null)
      .catch((e) => e as DIError)
    expect(err).toBeInstanceOf(DIError)
    expect(err?.code).toBe(DIErrorCode.ScopeIncompatibleError)
  })
})
