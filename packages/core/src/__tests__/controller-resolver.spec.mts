import {
  Container,
  getInjectableToken,
  globalRegistry,
  inject,
  Injectable,
  InjectableScope,
  Registry,
} from '@navios/di'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { InstanceResolverService } from '../services/instance-resolver.service.mjs'

function createTestSetup() {
  const registry = new Registry(globalRegistry)
  const container = new Container(registry)

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
        private service = inject(SimpleService)

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
        private service = inject(RequestScopedService)

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

    it('should update controller scope to Request when it has request-scoped dependencies', async () => {
      @Injectable({ scope: InjectableScope.Request, registry })
      class RequestScopedService {
        id = Math.random().toString(36).substring(7)
      }

      @Injectable({ registry })
      class ControllerWithRequestDep {
        private service = inject(RequestScopedService)

        getServiceId() {
          return this.service.id
        }
      }

      const resolver = await container.get(InstanceResolverService)
      await resolver.resolve(ControllerWithRequestDep)

      // Check that the controller's scope was updated
      const token = container.getRegistry().get(getInjectableToken(ControllerWithRequestDep))
      expect(token.scope).toBe(InjectableScope.Request)
    })

    it('should resolve different instances per request when controller has request-scoped deps', async () => {
      let serviceInstanceCount = 0

      @Injectable({ scope: InjectableScope.Request, registry })
      class RequestScopedService {
        id = ++serviceInstanceCount
      }

      @Injectable({ registry })
      class ControllerWithRequestDep {
        private service = inject(RequestScopedService)

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
      console.log('id1', id1)

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
        private tracker = inject(RequestTrackerService)

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
  })
})
