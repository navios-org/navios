import {
  Container,
  DIError,
  DIErrorCode,
  globalRegistry,
  Inject,
  Injectable,
  InjectableScope,
  Registry,
} from '@navios/di'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { InstanceResolverService } from '../services/instance-resolver.service.mjs'

function createTestSetup() {
  const registry = new Registry(globalRegistry)
  const container = new Container({ registry })

  return { registry, container }
}

describe('InstanceResolverService', () => {
  let container: Container
  let registry: Registry

  beforeEach(() => {
    const setup = createTestSetup()
    registry = setup.registry
    container = setup.container
  })

  afterEach(async () => {
    await container.dispose()
  })

  describe('resolve', () => {
    it('should cache singleton controller without request-scoped dependencies', async () => {
      @Injectable({ registry })
      class SimpleService {
        value = 'simple'
      }

      @Injectable({ registry })
      class SingletonController {
        @Inject(SimpleService) private accessor service!: SimpleService

        getValue() {
          return this.service.value
        }
      }

      const resolver = await container.get(InstanceResolverService)
      const resolution = await resolver.resolve(SingletonController)

      expect(resolution.cached).toBe(true)
      expect(resolution.instance).toBeInstanceOf(SingletonController)
      expect((resolution.instance as SingletonController).getValue()).toBe('simple')
    })

    it('should not cache controller with request-scoped dependencies', async () => {
      @Injectable({ scope: InjectableScope.Request, registry })
      class RequestScopedService {
        id = Math.random().toString(36).substring(7)
      }

      @Injectable({ registry })
      class ControllerWithRequestDep {
        @Inject(RequestScopedService) private accessor service!: RequestScopedService

        getServiceId() {
          return this.service.id
        }
      }

      const resolver = await container.get(InstanceResolverService)
      const resolution = await resolver.resolve(ControllerWithRequestDep)

      expect(resolution.cached).toBe(false)
      expect(resolution.instance).toBeNull()
      expect(typeof resolution.resolve).toBe('function')
    })

    it('should NOT mutate the registered scope (v2 explicit-opt-in contract)', async () => {
      // v2 deleted the v1 implicit Singleton->Request registry mutation. The
      // controller stays Singleton-registered; `container.get()` keeps failing
      // fast with ScopeIncompatibleError, while per-request resolution happens
      // via the explicit, non-mutating `resolveInScope`.
      @Injectable({ scope: InjectableScope.Request, registry })
      class RequestScopedService {
        id = Math.random().toString(36).substring(7)
      }

      @Injectable({ registry })
      class ControllerWithRequestDep {
        @Inject(RequestScopedService) private accessor service!: RequestScopedService

        getServiceId() {
          return this.service.id
        }
      }

      const resolver = await container.get(InstanceResolverService)
      const resolution = await resolver.resolve(ControllerWithRequestDep)
      expect(resolution.cached).toBe(false)

      // The controller's registration keeps its declared (Singleton) scope and
      // the validator memo is not poisoned: re-resolving as a plain singleton
      // STILL fails fast with ScopeIncompatibleError.
      let thrown: unknown = null
      try {
        await container.get(ControllerWithRequestDep)
      } catch (error) {
        thrown = error
      }
      expect(thrown).toBeInstanceOf(DIError)
      expect((thrown as DIError).code).toBe(DIErrorCode.ScopeIncompatibleError)

      // ...yet the explicit opt-in path still yields a working instance.
      const scoped = container.beginRequest('no-mutate-request')
      const instance = (await resolution.resolve(scoped)) as ControllerWithRequestDep
      expect(typeof instance.getServiceId()).toBe('string')
      await scoped.endRequest()
    })

    it('should resolve different instances per request when controller has request-scoped deps', async () => {
      let serviceInstanceCount = 0

      @Injectable({ scope: InjectableScope.Request, registry })
      class RequestScopedService {
        id = ++serviceInstanceCount
      }

      @Injectable({ registry })
      class ControllerWithRequestDep {
        @Inject(RequestScopedService) private accessor service!: RequestScopedService

        getServiceId() {
          return this.service.id
        }
      }

      const resolver = await container.get(InstanceResolverService)
      const resolution = await resolver.resolve(ControllerWithRequestDep)

      expect(resolution.cached).toBe(false)

      // Request 1
      const scoped1 = container.beginRequest('request-1')
      const controller1 = await resolution.resolve(scoped1)
      const id1 = (controller1 as ControllerWithRequestDep).getServiceId()

      // Request 2
      const scoped2 = container.beginRequest('request-2')
      const controller2 = await resolution.resolve(scoped2)
      const id2 = (controller2 as ControllerWithRequestDep).getServiceId()

      expect(id1).toBe(1)
      expect(id2).toBe(2)
      expect(controller1).not.toBe(controller2)

      await scoped1.endRequest()
      await scoped2.endRequest()
    })

    it('should handle parallel requests with isolated instances', async () => {
      let serviceInstanceCount = 0

      @Injectable({ scope: InjectableScope.Request, registry })
      class RequestTrackerService {
        id = ++serviceInstanceCount
        data: Record<string, any> = {}

        addData(key: string, value: any) {
          this.data[key] = value
        }

        getData(key: string) {
          return this.data[key]
        }
      }

      @Injectable({ registry })
      class ControllerWithTracker {
        @Inject(RequestTrackerService) private accessor tracker!: RequestTrackerService

        async handleRequest(data: string) {
          this.tracker.addData('input', data)
          // Simulate async work
          await new Promise((resolve) => setTimeout(resolve, 5))
          return {
            id: this.tracker.id,
            data: this.tracker.getData('input'),
          }
        }
      }

      const resolver = await container.get(InstanceResolverService)
      const resolution = await resolver.resolve(ControllerWithTracker)

      expect(resolution.cached).toBe(false)

      // Create 5 parallel requests
      const requests = ['req1', 'req2', 'req3', 'req4', 'req5'].map(async (data, i) => {
        const scoped = container.beginRequest(`request-${i}`)
        const controller = (await resolution.resolve(scoped)) as ControllerWithTracker
        const result = await controller.handleRequest(data)
        await scoped.endRequest()
        return result
      })

      const results = await Promise.all(requests)

      // Verify each request got its own unique ID
      const ids = results.map((r) => r.id)
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(5)

      // Verify each request returned its own data
      const expectedData = ['req1', 'req2', 'req3', 'req4', 'req5']
      const actualData = results.map((r) => r.data)
      expect(actualData).toEqual(expect.arrayContaining(expectedData))
    })

    it('should return same cached instance for singleton controllers', async () => {
      @Injectable({ registry })
      class SingletonController {
        id = Math.random()
      }

      const resolver = await container.get(InstanceResolverService)
      const resolution1 = await resolver.resolve(SingletonController)
      const resolution2 = await resolver.resolve(SingletonController)

      expect(resolution1.cached).toBe(true)
      expect(resolution2.cached).toBe(true)
      expect(resolution1.instance).toBe(resolution2.instance)
    })

    it('should not cache a directly Request-scoped class and resolve it per-request', async () => {
      // A class declared `@Injectable({ scope: Request })` (reachable via the
      // public `@Controller({ scope: InjectableScope.Request })` option) makes
      // the root `Container.get()` throw `ScopeMismatchError` BEFORE the
      // scope-validator runs — a different code than the eager-dependency
      // `ScopeIncompatibleError`. Both must trigger the per-request fallback.
      @Injectable({ scope: InjectableScope.Request, registry })
      class DirectlyRequestScopedController {
        id = Math.random().toString(36).substring(7)

        getId() {
          return this.id
        }
      }

      const resolver = await container.get(InstanceResolverService)
      const resolution = await resolver.resolve(DirectlyRequestScopedController)

      expect(resolution.cached).toBe(false)
      expect(resolution.instance).toBeNull()

      const scoped = container.beginRequest('directly-request-scoped')
      const instance = (await resolution.resolve(scoped)) as DirectlyRequestScopedController
      expect(instance).toBeInstanceOf(DirectlyRequestScopedController)
      expect(typeof instance.getId()).toBe('string')
      await scoped.endRequest()
    })

    it('should propagate a genuine construction error instead of swallowing it', async () => {
      // v1 used a blanket `catch {}` that masked real failures. v2 narrows the
      // catch to ScopeIncompatibleError only; any other error must surface.
      @Injectable({ registry })
      class ExplodingController {
        constructor() {
          throw new Error('boom from constructor')
        }
      }

      const resolver = await container.get(InstanceResolverService)

      await expect(resolver.resolve(ExplodingController)).rejects.toThrow(/boom from constructor/)
    })
  })

  describe('resolveMany', () => {
    it('should cache all when every class is a singleton', async () => {
      @Injectable({ registry })
      class A {
        a = 'a'
      }

      @Injectable({ registry })
      class B {
        b = 'b'
      }

      const resolver = await container.get(InstanceResolverService)
      const resolution = await resolver.resolveMany([A, B])

      expect(resolution.cached).toBe(true)
      expect(resolution.instances).toHaveLength(2)
      expect(resolution.instances?.[0]).toBeInstanceOf(A)
      expect(resolution.instances?.[1]).toBeInstanceOf(B)
    })

    it('should not cache when any class has request-scoped deps and resolve per-request', async () => {
      @Injectable({ scope: InjectableScope.Request, registry })
      class ReqScoped {
        id = Math.random()
      }

      @Injectable({ registry })
      class SingletonOnly {
        value = 'ok'
      }

      @Injectable({ registry })
      class NeedsRequest {
        @Inject(ReqScoped) private accessor dep!: ReqScoped

        getId() {
          return this.dep.id
        }
      }

      const resolver = await container.get(InstanceResolverService)
      const resolution = await resolver.resolveMany([SingletonOnly, NeedsRequest])

      expect(resolution.cached).toBe(false)
      expect(resolution.instances).toBeNull()

      const scoped = container.beginRequest('rm-request-1')
      const instances = await resolution.resolve(scoped)
      expect(instances).toHaveLength(2)
      expect(instances[0]).toBeInstanceOf(SingletonOnly)
      expect(instances[1]).toBeInstanceOf(NeedsRequest)
      await scoped.endRequest()
    })

    it('should not cache a directly Request-scoped class and resolve it per-request', async () => {
      // Same `ScopeMismatchError` gap as the single-resolve case, but through
      // the parallel `resolveMany` path.
      @Injectable({ registry })
      class PlainSingleton {
        value = 'plain'
      }

      @Injectable({ scope: InjectableScope.Request, registry })
      class DirectlyRequestScopedController {
        id = Math.random().toString(36).substring(7)

        getId() {
          return this.id
        }
      }

      const resolver = await container.get(InstanceResolverService)
      const resolution = await resolver.resolveMany([
        PlainSingleton,
        DirectlyRequestScopedController,
      ])

      expect(resolution.cached).toBe(false)
      expect(resolution.instances).toBeNull()

      const scoped = container.beginRequest('rm-directly-request-scoped')
      const instances = await resolution.resolve(scoped)
      expect(instances).toHaveLength(2)
      expect(instances[0]).toBeInstanceOf(PlainSingleton)
      expect(instances[1]).toBeInstanceOf(DirectlyRequestScopedController)
      expect(typeof (instances[1] as DirectlyRequestScopedController).getId()).toBe('string')
      await scoped.endRequest()
    })

    it('should propagate a genuine construction error from resolveMany', async () => {
      @Injectable({ registry })
      class FineService {
        ok = true
      }

      @Injectable({ registry })
      class Exploding {
        constructor() {
          throw new Error('boom in resolveMany')
        }
      }

      const resolver = await container.get(InstanceResolverService)

      await expect(resolver.resolveMany([FineService, Exploding])).rejects.toThrow(
        /boom in resolveMany/,
      )
    })
  })
})
