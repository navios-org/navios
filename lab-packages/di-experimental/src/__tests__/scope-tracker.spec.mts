import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { InjectableScope, InjectableType } from '../enums/index.mjs'
import { ScopeTracker } from '../internal/core/scope-tracker.mjs'
import { NameResolver } from '../internal/core/name-resolver.mjs'
import { InstanceStatus } from '../internal/holder/instance-holder.mjs'
import { UnifiedStorage } from '../internal/holder/unified-storage.mjs'
import { InjectionToken } from '../token/injection-token.mjs'
import { Registry } from '../token/registry.mjs'

describe('ScopeTracker', () => {
  let registry: Registry
  let nameResolver: NameResolver
  let scopeTracker: ScopeTracker
  let singletonStorage: UnifiedStorage
  let requestStorage: UnifiedStorage

  beforeEach(() => {
    registry = new Registry()
    nameResolver = new NameResolver()
    scopeTracker = new ScopeTracker(registry, nameResolver)
    singletonStorage = new UnifiedStorage(InjectableScope.Singleton)
    requestStorage = new UnifiedStorage(InjectableScope.Request)
  })

  describe('checkAndUpgradeScope', () => {
    describe('when conditions are NOT met for upgrade', () => {
      it('should return [false] when current service is NOT Singleton', () => {
        const token = InjectionToken.create<any>('TestService')
        registry.set(token, InjectableScope.Request, class {}, InjectableType.Class)

        const result = scopeTracker.checkAndUpgradeScope(
          'TestService',
          InjectableScope.Request, // Not Singleton
          'DependencyService',
          InjectableScope.Request,
          token,
          singletonStorage,
          requestStorage,
          'request-1',
        )

        expect(result).toEqual([false])
      })

      it('should return [false] when dependency is NOT Request-scoped', () => {
        const token = InjectionToken.create<any>('TestService')
        registry.set(token, InjectableScope.Singleton, class {}, InjectableType.Class)

        const result = scopeTracker.checkAndUpgradeScope(
          'TestService',
          InjectableScope.Singleton,
          'DependencyService',
          InjectableScope.Singleton, // Not Request
          token,
          singletonStorage,
          requestStorage,
          'request-1',
        )

        expect(result).toEqual([false])
      })

      it('should return [false] when dependency is Transient', () => {
        const token = InjectionToken.create<any>('TestService')
        registry.set(token, InjectableScope.Singleton, class {}, InjectableType.Class)

        const result = scopeTracker.checkAndUpgradeScope(
          'TestService',
          InjectableScope.Singleton,
          'DependencyService',
          InjectableScope.Transient, // Transient, not Request
          token,
          singletonStorage,
          requestStorage,
          'request-1',
        )

        expect(result).toEqual([false])
      })

      it('should return [false] when requestStorage is missing', () => {
        const token = InjectionToken.create<any>('TestService')
        registry.set(token, InjectableScope.Singleton, class {}, InjectableType.Class)

        const result = scopeTracker.checkAndUpgradeScope(
          'TestService',
          InjectableScope.Singleton,
          'DependencyService',
          InjectableScope.Request,
          token,
          singletonStorage,
          undefined, // No request storage
          'request-1',
        )

        expect(result).toEqual([false])
      })

      it('should return [false] when requestId is missing', () => {
        const token = InjectionToken.create<any>('TestService')
        registry.set(token, InjectableScope.Singleton, class {}, InjectableType.Class)

        const result = scopeTracker.checkAndUpgradeScope(
          'TestService',
          InjectableScope.Singleton,
          'DependencyService',
          InjectableScope.Request,
          token,
          singletonStorage,
          requestStorage,
          undefined, // No requestId
        )

        expect(result).toEqual([false])
      })
    })

    describe('when conditions ARE met for upgrade', () => {
      it('should upgrade scope when Singleton depends on Request-scoped', () => {
        const token = InjectionToken.create<any>('TestService')
        registry.set(token, InjectableScope.Singleton, class {}, InjectableType.Class)

        const serviceName = token.id
        const requestId = 'request-1'

        const result = scopeTracker.checkAndUpgradeScope(
          serviceName,
          InjectableScope.Singleton,
          'DependencyService',
          InjectableScope.Request,
          token,
          singletonStorage,
          requestStorage,
          requestId,
        )

        expect(result[0]).toBe(true)
        expect(result[1]).toBeDefined()
        expect(result[1]).toContain(`requestId=${requestId}`)
      })

      it('should update registry scope to Request', () => {
        const token = InjectionToken.create<any>('TestService')
        registry.set(token, InjectableScope.Singleton, class {}, InjectableType.Class)

        expect(registry.get(token).scope).toBe(InjectableScope.Singleton)

        scopeTracker.checkAndUpgradeScope(
          token.id,
          InjectableScope.Singleton,
          'DependencyService',
          InjectableScope.Request,
          token,
          singletonStorage,
          requestStorage,
          'request-1',
        )

        expect(registry.get(token).scope).toBe(InjectableScope.Request)
      })

      it('should move existing holder from singleton to request storage', () => {
        const token = InjectionToken.create<any>('TestService')
        registry.set(token, InjectableScope.Singleton, class {}, InjectableType.Class)

        const serviceName = token.id
        const requestId = 'request-1'

        // Create a holder in singleton storage
        const [deferred, holder] = singletonStorage.createHolder(
          serviceName,
          InjectableType.Class,
          new Set(),
        )
        holder.status = InstanceStatus.Created
        holder.instance = { value: 'test' }
        singletonStorage.set(serviceName, holder)

        // Verify holder is in singleton storage
        expect(singletonStorage.get(serviceName)).not.toBeNull()

        const [success, newName] = scopeTracker.checkAndUpgradeScope(
          serviceName,
          InjectableScope.Singleton,
          'DependencyService',
          InjectableScope.Request,
          token,
          singletonStorage,
          requestStorage,
          requestId,
        )

        expect(success).toBe(true)
        expect(newName).toBeDefined()

        // Holder should be removed from singleton storage
        expect(singletonStorage.get(serviceName)).toBeNull()

        // Holder should be in request storage with new name
        const requestResult = requestStorage.get(newName!)
        expect(requestResult).not.toBeNull()
        expect(requestResult![1]?.instance).toEqual({ value: 'test' })
      })

      it('should preserve holder data during move', () => {
        const token = InjectionToken.create<any>('TestService')
        registry.set(token, InjectableScope.Singleton, class {}, InjectableType.Class)

        const serviceName = token.id
        const requestId = 'request-1'

        // Create a holder with dependencies
        const deps = new Set(['dep1', 'dep2'])
        const [deferred, holder] = singletonStorage.createHolder(
          serviceName,
          InjectableType.Class,
          deps,
        )
        holder.status = InstanceStatus.Created
        holder.instance = { value: 'test' }
        holder.destroyListeners = [() => {}, () => {}]
        singletonStorage.set(serviceName, holder)

        const [success, newName] = scopeTracker.checkAndUpgradeScope(
          serviceName,
          InjectableScope.Singleton,
          'DependencyService',
          InjectableScope.Request,
          token,
          singletonStorage,
          requestStorage,
          requestId,
        )

        expect(success).toBe(true)

        const requestResult = requestStorage.get(newName!)
        const movedHolder = requestResult![1]!

        expect(movedHolder.instance).toEqual({ value: 'test' })
        expect(movedHolder.destroyListeners).toHaveLength(2)
        expect(movedHolder.name).toBe(newName)
      })

      it('should handle holder in Creating state', () => {
        const token = InjectionToken.create<any>('TestService')
        registry.set(token, InjectableScope.Singleton, class {}, InjectableType.Class)

        const serviceName = token.id
        const requestId = 'request-1'

        // Create a holder in Creating state
        const [deferred, holder] = singletonStorage.createHolder(
          serviceName,
          InjectableType.Class,
          new Set(),
        )
        // Leave status as Creating (default)
        singletonStorage.set(serviceName, holder)

        const [success, newName] = scopeTracker.checkAndUpgradeScope(
          serviceName,
          InjectableScope.Singleton,
          'DependencyService',
          InjectableScope.Request,
          token,
          singletonStorage,
          requestStorage,
          requestId,
        )

        expect(success).toBe(true)
        expect(newName).toBeDefined()

        // Should still move the holder
        expect(singletonStorage.get(serviceName)).toBeNull()
        expect(requestStorage.get(newName!)).not.toBeNull()
      })
    })

    describe('name generation', () => {
      it('should generate correct name for simple token', () => {
        const token = InjectionToken.create<any>('TestService')
        registry.set(token, InjectableScope.Singleton, class {}, InjectableType.Class)

        const serviceName = token.id
        const requestId = 'request-1'

        const [success, newName] = scopeTracker.checkAndUpgradeScope(
          serviceName,
          InjectableScope.Singleton,
          'DependencyService',
          InjectableScope.Request,
          token,
          singletonStorage,
          requestStorage,
          requestId,
        )

        expect(success).toBe(true)
        expect(newName).toBe(`${serviceName}:requestId=${requestId}`)
      })

      it('should preserve args hash in name when upgrading', () => {
        const token = InjectionToken.create<any>('TestService')
        registry.set(token, InjectableScope.Singleton, class {}, InjectableType.Class)

        const serviceName = `${token.id}:abc123` // Token with args hash
        const requestId = 'request-1'

        const [success, newName] = scopeTracker.checkAndUpgradeScope(
          serviceName,
          InjectableScope.Singleton,
          'DependencyService',
          InjectableScope.Request,
          token,
          singletonStorage,
          requestStorage,
          requestId,
        )

        expect(success).toBe(true)
        expect(newName).toBe(`${token.id}:requestId=${requestId}:abc123`)
      })
    })
  })

  describe('upgradeScopeToRequest (async)', () => {
    it('should return success and new name on successful upgrade', async () => {
      const token = InjectionToken.create<any>('TestService')
      registry.set(token, InjectableScope.Singleton, class {}, InjectableType.Class)

      const serviceName = token.id
      const requestId = 'request-1'

      const [success, newName, error] = await scopeTracker.upgradeScopeToRequest(
        serviceName,
        token,
        singletonStorage,
        requestStorage,
        requestId,
      )

      expect(success).toBe(true)
      expect(newName).toBeDefined()
      expect(error).toBeUndefined()
    })

    it('should return error when registry update fails', async () => {
      const token = InjectionToken.create<any>('NonExistentService')
      // Don't register the token

      const [success, newName, error] = await scopeTracker.upgradeScopeToRequest(
        'NonExistentService',
        token,
        singletonStorage,
        requestStorage,
        'request-1',
      )

      expect(success).toBe(false)
      expect(newName).toBeUndefined()
      expect(error).toBeDefined()
    })
  })

  describe('updateParentDependencies', () => {
    it('should update dependency references in singleton storage', () => {
      const oldName = 'OldServiceName'
      const newName = 'NewServiceName:requestId=req-1'

      // Create a holder that depends on the old name
      const [, parentHolder] = singletonStorage.createHolder(
        'ParentService',
        InjectableType.Class,
        new Set([oldName]),
      )
      singletonStorage.set('ParentService', parentHolder)

      scopeTracker.updateParentDependencies(
        oldName,
        newName,
        singletonStorage,
        requestStorage,
      )

      // Check that parent's deps are updated
      const updatedResult = singletonStorage.get('ParentService')
      expect(updatedResult).not.toBeNull()
      expect(updatedResult![1]!.deps.has(oldName)).toBe(false)
      expect(updatedResult![1]!.deps.has(newName)).toBe(true)
    })

    it('should update dependency references in request storage', () => {
      const oldName = 'OldServiceName'
      const newName = 'NewServiceName:requestId=req-1'

      // Create a holder in request storage that depends on the old name
      const [, parentHolder] = requestStorage.createHolder(
        'ParentService:requestId=req-1',
        InjectableType.Class,
        new Set([oldName]),
      )
      requestStorage.set('ParentService:requestId=req-1', parentHolder)

      scopeTracker.updateParentDependencies(
        oldName,
        newName,
        singletonStorage,
        requestStorage,
      )

      // Check that parent's deps are updated
      const updatedResult = requestStorage.get('ParentService:requestId=req-1')
      expect(updatedResult).not.toBeNull()
      expect(updatedResult![1]!.deps.has(oldName)).toBe(false)
      expect(updatedResult![1]!.deps.has(newName)).toBe(true)
    })

    it('should update dependencies in both storages', () => {
      const oldName = 'OldServiceName'
      const newName = 'NewServiceName:requestId=req-1'

      // Create holders in both storages
      const [, singletonHolder] = singletonStorage.createHolder(
        'SingletonParent',
        InjectableType.Class,
        new Set([oldName]),
      )
      singletonStorage.set('SingletonParent', singletonHolder)

      const [, requestHolder] = requestStorage.createHolder(
        'RequestParent:requestId=req-1',
        InjectableType.Class,
        new Set([oldName]),
      )
      requestStorage.set('RequestParent:requestId=req-1', requestHolder)

      scopeTracker.updateParentDependencies(
        oldName,
        newName,
        singletonStorage,
        requestStorage,
      )

      // Both should be updated
      const singletonResult = singletonStorage.get('SingletonParent')
      expect(singletonResult![1]!.deps.has(newName)).toBe(true)

      const requestResult = requestStorage.get('RequestParent:requestId=req-1')
      expect(requestResult![1]!.deps.has(newName)).toBe(true)
    })
  })

  describe('logging', () => {
    it('should log when scope upgrade occurs', () => {
      const mockLogger = {
        log: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      } as unknown as Console

      const trackerWithLogger = new ScopeTracker(registry, nameResolver, mockLogger)

      const token = InjectionToken.create<any>('TestService')
      registry.set(token, InjectableScope.Singleton, class {}, InjectableType.Class)

      trackerWithLogger.checkAndUpgradeScope(
        token.id,
        InjectableScope.Singleton,
        'DependencyService',
        InjectableScope.Request,
        token,
        singletonStorage,
        requestStorage,
        'request-1',
      )

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('Upgrading'),
      )
    })

    it('should warn when requestStorage is missing', () => {
      const mockLogger = {
        log: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      } as unknown as Console

      const trackerWithLogger = new ScopeTracker(registry, nameResolver, mockLogger)

      const token = InjectionToken.create<any>('TestService')
      registry.set(token, InjectableScope.Singleton, class {}, InjectableType.Class)

      trackerWithLogger.checkAndUpgradeScope(
        token.id,
        InjectableScope.Singleton,
        'DependencyService',
        InjectableScope.Request,
        token,
        singletonStorage,
        undefined, // Missing
        'request-1',
      )

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Cannot upgrade scope'),
      )
    })
  })
})
