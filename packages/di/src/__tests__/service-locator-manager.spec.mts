import { beforeEach, describe, expect, it, vi } from 'vitest'

import { InjectableScope, InjectableType } from '../enums/index.mjs'
import { DIError } from '../errors/index.mjs'
import { InstanceStatus } from '../internal/holder/instance-holder.mjs'
import { HolderManager } from '../internal/holder/holder-manager.mjs'

describe('HolderManager', () => {
  let manager: HolderManager
  let mockLogger: Console

  beforeEach(() => {
    mockLogger = {
      log: vi.fn(),
    } as any as Console
    manager = new HolderManager(mockLogger)
  })

  describe('constructor', () => {
    it('should create manager without logger', () => {
      const managerWithoutLogger = new HolderManager()
      expect(managerWithoutLogger).toBeDefined()
    })

    it('should create manager with logger', () => {
      expect(manager).toBeDefined()
    })
  })

  describe('get', () => {
    it('should return DIError.instanceNotFound for non-existent instance', () => {
      const result = manager.get('non-existent')

      expect(result).toHaveLength(1)
      expect(result[0]).toBeInstanceOf(DIError)
      expect(mockLogger.log).toHaveBeenCalledWith(
        '[ServiceLocatorManager]#getInstanceHolder() Instance non-existent not found',
      )
    })

    it('should return valid holder for existing instance', () => {
      const holder = manager.storeCreatedHolder(
        'test-instance',
        { value: 'test' },
        InjectableType.Class,
        InjectableScope.Singleton,
      )

      const result = manager.get('test-instance')

      expect(result).toHaveLength(2)
      expect(result[0]).toBeUndefined()
      expect(result[1]).toBe(holder)
    })

    it('should return DIError.instanceDestroying for destroying instance', () => {
      const holder = manager.storeCreatedHolder(
        'destroying-instance',
        { value: 'test' },
        InjectableType.Class,
        InjectableScope.Singleton,
      )

      // Manually set status to destroying
      holder.status = InstanceStatus.Destroying

      const result = manager.get('destroying-instance')

      expect(result).toHaveLength(2)
      expect(result[0]).toBeInstanceOf(DIError)
      expect(result[1]).toBe(holder)
      expect(mockLogger.log).toHaveBeenCalledWith(
        '[ServiceLocatorManager]#getInstanceHolder() Instance destroying-instance is destroying',
      )
    })

    it('should return error for instance in error state', () => {
      const holder = manager.storeCreatedHolder(
        'error-instance',
        { value: 'test' },
        InjectableType.Class,
        InjectableScope.Singleton,
      )

      // Manually set status to error with an error instance
      holder.status = InstanceStatus.Error
      const errorInstance = DIError.instanceNotFound('error-instance')
      holder.instance = errorInstance

      const result = manager.get('error-instance')

      expect(result).toHaveLength(2)
      expect(result[0]).toBeInstanceOf(DIError)
      expect(result[1]).toBe(holder)
      expect(mockLogger.log).toHaveBeenCalledWith(
        '[ServiceLocatorManager]#getInstanceHolder() Instance error-instance is in error state',
      )
    })
  })

  describe('set', () => {
    it('should store holder with given name', () => {
      const holder = manager.storeCreatedHolder(
        'test-instance',
        { value: 'test' },
        InjectableType.Class,
        InjectableScope.Singleton,
      )

      manager.set('new-name', holder)

      const result = manager.get('new-name')
      expect(result).toHaveLength(2)
      expect(result[0]).toBeUndefined()
      expect(result[1]).toBe(holder)
    })
  })

  describe('has', () => {
    it('should return false for non-existent instance', () => {
      const result = manager.has('non-existent')

      expect(result).toHaveLength(2)
      expect(result[0]).toBeUndefined()
      expect(result[1]).toBe(false)
    })

    it('should return true for existing instance', () => {
      manager.storeCreatedHolder(
        'test-instance',
        { value: 'test' },
        InjectableType.Class,
        InjectableScope.Singleton,
      )

      const result = manager.has('test-instance')

      expect(result).toHaveLength(2)
      expect(result[0]).toBeUndefined()
      expect(result[1]).toBe(true)
    })

    it('should return error for destroying instance', () => {
      const holder = manager.storeCreatedHolder(
        'destroying-instance',
        { value: 'test' },
        InjectableType.Class,
        InjectableScope.Singleton,
      )

      holder.status = InstanceStatus.Destroying

      const result = manager.has('destroying-instance')

      expect(result).toHaveLength(1)
      expect(result[0]).toBeInstanceOf(DIError)
    })
  })

  describe('delete', () => {
    it('should delete existing instance and return true', () => {
      manager.storeCreatedHolder(
        'test-instance',
        { value: 'test' },
        InjectableType.Class,
        InjectableScope.Singleton,
      )

      const result = manager.delete('test-instance')
      expect(result).toBe(true)

      const getResult = manager.get('test-instance')
      expect(getResult).toHaveLength(1)
      expect(getResult[0]).toBeInstanceOf(DIError)
    })

    it('should return false for non-existent instance', () => {
      const result = manager.delete('non-existent')
      expect(result).toBe(false)
    })
  })

  describe('filter', () => {
    it('should filter instances by predicate', () => {
      manager.storeCreatedHolder(
        'instance1',
        { value: 'test1' },
        InjectableType.Class,
        InjectableScope.Singleton,
      )
      manager.storeCreatedHolder(
        'instance2',
        { value: 'test2' },
        InjectableType.Factory,
        InjectableScope.Transient,
      )

      const result = manager.filter(
        (holder) => holder.type === InjectableType.Class,
      )

      expect(result.size).toBe(1)
      expect(result.has('instance1')).toBe(true)
      expect(result.has('instance2')).toBe(false)
    })

    it('should return empty map when no instances match', () => {
      manager.storeCreatedHolder(
        'instance1',
        { value: 'test1' },
        InjectableType.Class,
        InjectableScope.Singleton,
      )

      const result = manager.filter(
        (holder) => holder.type === InjectableType.Factory,
      )

      expect(result.size).toBe(0)
    })
  })

  describe('createCreatingHolder', () => {
    it('should create holder with Creating status and deferred promise', () => {
      const [deferred, holder] = manager.createCreatingHolder(
        'test-instance',
        InjectableType.Class,
        InjectableScope.Singleton,
      )

      expect(deferred).toBeDefined()
      expect(deferred.promise).toBeInstanceOf(Promise)
      expect(holder.status).toBe(InstanceStatus.Creating)
      expect(holder.name).toBe('test-instance')
      expect(holder.instance).toBeNull()
      expect(holder.creationPromise).toBe(deferred.promise)
      expect(holder.type).toBe(InjectableType.Class)
      expect(holder.scope).toBe(InjectableScope.Singleton)
      expect(holder.deps).toEqual(new Set())
    })

    it('should create holder with custom dependencies', () => {
      const deps = new Set(['dep1', 'dep2'])

      const [, holder] = manager.createCreatingHolder(
        'test-instance',
        InjectableType.Factory,
        InjectableScope.Request,
        deps,
      )

      expect(holder.deps).toBe(deps)
      expect(holder.type).toBe(InjectableType.Factory)
      expect(holder.scope).toBe(InjectableScope.Request)
    })
  })

  describe('storeCreatedHolder', () => {
    it('should create and store holder with Created status', () => {
      const instance = { value: 'test' }
      const holder = manager.storeCreatedHolder(
        'test-instance',
        instance,
        InjectableType.Class,
        InjectableScope.Singleton,
      )

      expect(holder.status).toBe(InstanceStatus.Created)
      expect(holder.name).toBe('test-instance')
      expect(holder.instance).toBe(instance)
      expect(holder.creationPromise).toBeNull()
      expect(holder.type).toBe(InjectableType.Class)
      expect(holder.scope).toBe(InjectableScope.Singleton)
      expect(holder.deps).toEqual(new Set())

      // Verify it's stored
      const getResult = manager.get('test-instance')
      expect(getResult).toHaveLength(2)
      expect(getResult[0]).toBeUndefined()
      expect(getResult[1]).toBe(holder)
    })

    it('should create holder with custom dependencies', () => {
      const deps = new Set(['dep1', 'dep2'])
      const instance = { value: 'test' }

      const holder = manager.storeCreatedHolder(
        'test-instance',
        instance,
        InjectableType.Factory,
        InjectableScope.Request,
        deps,
      )

      expect(holder.deps).toBe(deps)
      expect(holder.type).toBe(InjectableType.Factory)
      expect(holder.scope).toBe(InjectableScope.Request)
    })
  })
})
