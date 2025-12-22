import { describe, expect, it, beforeEach } from 'vitest'

import { InjectableScope, InjectableType } from '../enums/index.mjs'
import { DIError, DIErrorCode } from '../errors/index.mjs'
import { UnifiedStorage } from '../internal/holder/unified-storage.mjs'
import { InstanceStatus } from '../internal/holder/instance-holder.mjs'
import type { InstanceHolder } from '../internal/holder/instance-holder.mjs'

describe('UnifiedStorage', () => {
  let storage: UnifiedStorage

  beforeEach(() => {
    storage = new UnifiedStorage(InjectableScope.Singleton)
  })

  describe('constructor', () => {
    it('should create storage with default Singleton scope', () => {
      const defaultStorage = new UnifiedStorage()
      expect(defaultStorage.scope).toBe(InjectableScope.Singleton)
    })

    it('should create storage with specified scope', () => {
      const requestStorage = new UnifiedStorage(InjectableScope.Request)
      expect(requestStorage.scope).toBe(InjectableScope.Request)
    })
  })

  describe('get', () => {
    it('should return null for non-existent instance', () => {
      const result = storage.get('non-existent')
      expect(result).toBeNull()
    })

    it('should return holder for existing instance in Created state', () => {
      const holder: InstanceHolder = {
        status: InstanceStatus.Created,
        name: 'test',
        instance: { value: 'test' },
        creationPromise: null,
        destroyPromise: null,
        type: InjectableType.Class,
        scope: InjectableScope.Singleton,
        deps: new Set(),
        destroyListeners: [],
        createdAt: Date.now(),
        waitingFor: new Set(),
      }
      storage.set('test', holder)

      const result = storage.get('test')
      expect(result).not.toBeNull()
      expect(result![0]).toBeUndefined()
      expect(result![1]).toBe(holder)
    })

    it('should return holder for instance in Creating state', () => {
      const holder: InstanceHolder = {
        status: InstanceStatus.Creating,
        name: 'test',
        instance: null,
        creationPromise: Promise.resolve([undefined, {}]) as any,
        destroyPromise: null,
        type: InjectableType.Class,
        scope: InjectableScope.Singleton,
        deps: new Set(),
        destroyListeners: [],
        createdAt: Date.now(),
        waitingFor: new Set(),
      }
      storage.set('test', holder)

      const result = storage.get('test')
      expect(result).not.toBeNull()
      expect(result![0]).toBeUndefined()
      expect(result![1]).toBe(holder)
    })

    it('should return error for instance in Destroying state', () => {
      const holder: InstanceHolder = {
        status: InstanceStatus.Destroying,
        name: 'test',
        instance: null,
        creationPromise: null,
        destroyPromise: Promise.resolve(),
        type: InjectableType.Class,
        scope: InjectableScope.Singleton,
        deps: new Set(),
        destroyListeners: [],
        createdAt: Date.now(),
        waitingFor: new Set(),
      }
      storage.set('test', holder)

      const result = storage.get('test')
      expect(result).not.toBeNull()
      expect(result![0]).toBeInstanceOf(DIError)
      expect(result![0]?.code).toBe(DIErrorCode.InstanceDestroying)
    })

    it('should return error for instance in Error state', () => {
      const originalError = DIError.initializationError('test', 'Failed')
      const holder: InstanceHolder = {
        status: InstanceStatus.Error,
        name: 'test',
        instance: originalError,
        creationPromise: null,
        destroyPromise: null,
        type: InjectableType.Class,
        scope: InjectableScope.Singleton,
        deps: new Set(),
        destroyListeners: [],
        createdAt: Date.now(),
        waitingFor: new Set(),
      }
      storage.set('test', holder)

      const result = storage.get('test')
      expect(result).not.toBeNull()
      expect(result![0]).toBe(originalError)
    })
  })

  describe('set', () => {
    it('should store holder', () => {
      const holder: InstanceHolder = {
        status: InstanceStatus.Created,
        name: 'test',
        instance: {},
        creationPromise: null,
        destroyPromise: null,
        type: InjectableType.Class,
        scope: InjectableScope.Singleton,
        deps: new Set(),
        destroyListeners: [],
        createdAt: Date.now(),
        waitingFor: new Set(),
      }
      storage.set('test', holder)

      const result = storage.get('test')
      expect(result![1]).toBe(holder)
    })

    it('should register dependencies in reverse index', () => {
      const holder: InstanceHolder = {
        status: InstanceStatus.Created,
        name: 'child',
        instance: {},
        creationPromise: null,
        destroyPromise: null,
        type: InjectableType.Class,
        scope: InjectableScope.Singleton,
        deps: new Set(['parent1', 'parent2']),
        destroyListeners: [],
        createdAt: Date.now(),
        waitingFor: new Set(),
      }
      storage.set('child', holder)

      // findDependents should now return the child for each parent
      expect(storage.findDependents('parent1')).toContain('child')
      expect(storage.findDependents('parent2')).toContain('child')
    })
  })

  describe('delete', () => {
    it('should delete existing holder', () => {
      const holder: InstanceHolder = {
        status: InstanceStatus.Created,
        name: 'test',
        instance: {},
        creationPromise: null,
        destroyPromise: null,
        type: InjectableType.Class,
        scope: InjectableScope.Singleton,
        deps: new Set(),
        destroyListeners: [],
        createdAt: Date.now(),
        waitingFor: new Set(),
      }
      storage.set('test', holder)

      const result = storage.delete('test')
      expect(result).toBe(true)
      expect(storage.get('test')).toBeNull()
    })

    it('should return false for non-existent holder', () => {
      const result = storage.delete('non-existent')
      expect(result).toBe(false)
    })

    it('should remove from reverse dependency index', () => {
      const holder: InstanceHolder = {
        status: InstanceStatus.Created,
        name: 'child',
        instance: {},
        creationPromise: null,
        destroyPromise: null,
        type: InjectableType.Class,
        scope: InjectableScope.Singleton,
        deps: new Set(['parent']),
        destroyListeners: [],
        createdAt: Date.now(),
        waitingFor: new Set(),
      }
      storage.set('child', holder)
      expect(storage.findDependents('parent')).toContain('child')

      storage.delete('child')
      expect(storage.findDependents('parent')).not.toContain('child')
    })
  })

  describe('createHolder', () => {
    it('should create holder in Creating state', () => {
      const [deferred, holder] = storage.createHolder<{ value: string }>(
        'test',
        InjectableType.Class,
        new Set(),
      )

      expect(holder.status).toBe(InstanceStatus.Creating)
      expect(holder.name).toBe('test')
      expect(holder.instance).toBeNull()
      expect(holder.creationPromise).toBe(deferred.promise)
      expect(holder.type).toBe(InjectableType.Class)
      expect(holder.scope).toBe(InjectableScope.Singleton)
    })

    it('should return working deferred promise', async () => {
      const [deferred, holder] = storage.createHolder<{ value: string }>(
        'test',
        InjectableType.Class,
        new Set(),
      )

      const testValue = { value: 'resolved' }
      deferred.resolve([undefined, testValue])

      const result = await holder.creationPromise
      expect(result).toEqual([undefined, testValue])
    })

    it('should use storage scope for holder', () => {
      const requestStorage = new UnifiedStorage(InjectableScope.Request)
      const [, holder] = requestStorage.createHolder(
        'test',
        InjectableType.Class,
        new Set(),
      )

      expect(holder.scope).toBe(InjectableScope.Request)
    })

    it('should include provided dependencies', () => {
      const deps = new Set(['dep1', 'dep2'])
      const [, holder] = storage.createHolder(
        'test',
        InjectableType.Class,
        deps,
      )

      expect(holder.deps).toBe(deps)
    })
  })

  describe('storeInstance', () => {
    it('should store instance directly in Created state', () => {
      const instance = { value: 'test' }
      storage.storeInstance('test', instance)

      const result = storage.get('test')
      expect(result![1]?.status).toBe(InstanceStatus.Created)
      expect(result![1]?.instance).toBe(instance)
    })

    it('should throw error if instance already exists', () => {
      storage.storeInstance('test', { value: 'first' })

      expect(() => {
        storage.storeInstance('test', { value: 'second' })
      }).toThrow(DIError)
    })

    it('should register onServiceDestroy listener if present', () => {
      const destroyFn = () => {}
      const instance = { onServiceDestroy: destroyFn }
      storage.storeInstance('test', instance)

      const result = storage.get('test')
      expect(result![1]?.destroyListeners).toContain(destroyFn)
    })

    it('should not add destroy listener for non-object values', () => {
      storage.storeInstance('test', 'string-value')

      const result = storage.get('test')
      expect(result![1]?.destroyListeners).toHaveLength(0)
    })
  })

  describe('handles', () => {
    it('should return true for matching scope', () => {
      expect(storage.handles(InjectableScope.Singleton)).toBe(true)
    })

    it('should return false for non-matching scope', () => {
      expect(storage.handles(InjectableScope.Request)).toBe(false)
      expect(storage.handles(InjectableScope.Transient)).toBe(false)
    })
  })

  describe('getAllNames', () => {
    it('should return empty array for empty storage', () => {
      expect(storage.getAllNames()).toEqual([])
    })

    it('should return all instance names', () => {
      storage.storeInstance('a', {})
      storage.storeInstance('b', {})
      storage.storeInstance('c', {})

      const names = storage.getAllNames()
      expect(names).toHaveLength(3)
      expect(names).toContain('a')
      expect(names).toContain('b')
      expect(names).toContain('c')
    })
  })

  describe('forEach', () => {
    it('should iterate over all holders', () => {
      storage.storeInstance('a', { id: 1 })
      storage.storeInstance('b', { id: 2 })

      const visited: string[] = []
      storage.forEach((name, holder) => {
        visited.push(name)
      })

      expect(visited).toHaveLength(2)
      expect(visited).toContain('a')
      expect(visited).toContain('b')
    })

    it('should not call callback for empty storage', () => {
      const callback = () => {
        throw new Error('Should not be called')
      }
      storage.forEach(callback)
    })
  })

  describe('findByInstance', () => {
    it('should find holder by instance reference', () => {
      const instance = { value: 'test' }
      storage.storeInstance('test', instance)

      const holder = storage.findByInstance(instance)
      expect(holder).not.toBeNull()
      expect(holder?.name).toBe('test')
    })

    it('should return null for non-existent instance', () => {
      const holder = storage.findByInstance({ value: 'not-stored' })
      expect(holder).toBeNull()
    })

    it('should match by reference, not value', () => {
      const instance = { value: 'test' }
      storage.storeInstance('test', instance)

      // Different object with same value
      const holder = storage.findByInstance({ value: 'test' })
      expect(holder).toBeNull()
    })
  })

  describe('findDependents', () => {
    it('should return empty array for instance with no dependents', () => {
      storage.storeInstance('orphan', {})
      expect(storage.findDependents('orphan')).toEqual([])
    })

    it('should return dependents for instance', () => {
      // Create parent
      storage.storeInstance('parent', {})

      // Create children that depend on parent
      const child1Holder: InstanceHolder = {
        status: InstanceStatus.Created,
        name: 'child1',
        instance: {},
        creationPromise: null,
        destroyPromise: null,
        type: InjectableType.Class,
        scope: InjectableScope.Singleton,
        deps: new Set(['parent']),
        destroyListeners: [],
        createdAt: Date.now(),
        waitingFor: new Set(),
      }
      const child2Holder: InstanceHolder = {
        status: InstanceStatus.Created,
        name: 'child2',
        instance: {},
        creationPromise: null,
        destroyPromise: null,
        type: InjectableType.Class,
        scope: InjectableScope.Singleton,
        deps: new Set(['parent']),
        destroyListeners: [],
        createdAt: Date.now(),
        waitingFor: new Set(),
      }

      storage.set('child1', child1Holder)
      storage.set('child2', child2Holder)

      const dependents = storage.findDependents('parent')
      expect(dependents).toHaveLength(2)
      expect(dependents).toContain('child1')
      expect(dependents).toContain('child2')
    })
  })

  describe('updateDependencyReference', () => {
    it('should update dependency references in holder deps', () => {
      // Create a holder that depends on 'oldName'
      const holder: InstanceHolder = {
        status: InstanceStatus.Created,
        name: 'dependent',
        instance: {},
        creationPromise: null,
        destroyPromise: null,
        type: InjectableType.Class,
        scope: InjectableScope.Singleton,
        deps: new Set(['oldName']),
        destroyListeners: [],
        createdAt: Date.now(),
        waitingFor: new Set(),
      }
      storage.set('dependent', holder)

      storage.updateDependencyReference('oldName', 'newName')

      // Check that deps was updated
      expect(holder.deps.has('oldName')).toBe(false)
      expect(holder.deps.has('newName')).toBe(true)
    })

    it('should update reverse dependency index', () => {
      // Create a holder that depends on 'oldName'
      const holder: InstanceHolder = {
        status: InstanceStatus.Created,
        name: 'dependent',
        instance: {},
        creationPromise: null,
        destroyPromise: null,
        type: InjectableType.Class,
        scope: InjectableScope.Singleton,
        deps: new Set(['oldName']),
        destroyListeners: [],
        createdAt: Date.now(),
        waitingFor: new Set(),
      }
      storage.set('dependent', holder)

      // Verify initial state
      expect(storage.findDependents('oldName')).toContain('dependent')
      expect(storage.findDependents('newName')).not.toContain('dependent')

      storage.updateDependencyReference('oldName', 'newName')

      // Verify updated state
      expect(storage.findDependents('oldName')).not.toContain('dependent')
      expect(storage.findDependents('newName')).toContain('dependent')
    })

    it('should handle multiple dependents', () => {
      const holder1: InstanceHolder = {
        status: InstanceStatus.Created,
        name: 'dep1',
        instance: {},
        creationPromise: null,
        destroyPromise: null,
        type: InjectableType.Class,
        scope: InjectableScope.Singleton,
        deps: new Set(['oldName']),
        destroyListeners: [],
        createdAt: Date.now(),
        waitingFor: new Set(),
      }
      const holder2: InstanceHolder = {
        status: InstanceStatus.Created,
        name: 'dep2',
        instance: {},
        creationPromise: null,
        destroyPromise: null,
        type: InjectableType.Class,
        scope: InjectableScope.Singleton,
        deps: new Set(['oldName']),
        destroyListeners: [],
        createdAt: Date.now(),
        waitingFor: new Set(),
      }

      storage.set('dep1', holder1)
      storage.set('dep2', holder2)

      storage.updateDependencyReference('oldName', 'newName')

      expect(storage.findDependents('newName')).toContain('dep1')
      expect(storage.findDependents('newName')).toContain('dep2')
    })
  })

  describe('scope isolation', () => {
    it('should maintain separate instances per storage', () => {
      const singletonStorage = new UnifiedStorage(InjectableScope.Singleton)
      const requestStorage = new UnifiedStorage(InjectableScope.Request)

      singletonStorage.storeInstance('service', { scope: 'singleton' })
      requestStorage.storeInstance('service', { scope: 'request' })

      const singletonResult = singletonStorage.get('service')
      const requestResult = requestStorage.get('service')

      expect(singletonResult![1]?.instance).toEqual({ scope: 'singleton' })
      expect(requestResult![1]?.instance).toEqual({ scope: 'request' })
    })
  })
})
