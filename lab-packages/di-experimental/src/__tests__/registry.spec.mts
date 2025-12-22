import { describe, expect, it, beforeEach } from 'vitest'

import { InjectableScope, InjectableType } from '../enums/index.mjs'
import { InjectionToken } from '../token/injection-token.mjs'
import { Registry, globalRegistry } from '../token/registry.mjs'

describe('Registry', () => {
  let registry: Registry

  beforeEach(() => {
    registry = new Registry()
  })

  describe('has', () => {
    it('should return false for non-existent token', () => {
      const token = InjectionToken.create<string>('test')
      expect(registry.has(token)).toBe(false)
    })

    it('should return true for registered token', () => {
      const token = InjectionToken.create<string>('test')
      registry.set(token, InjectableScope.Singleton, class Test {}, InjectableType.Class)

      expect(registry.has(token)).toBe(true)
    })

    it('should check parent registry', () => {
      const parentRegistry = new Registry()
      const childRegistry = new Registry(parentRegistry)
      const token = InjectionToken.create<string>('test')

      parentRegistry.set(
        token,
        InjectableScope.Singleton,
        class Test {},
        InjectableType.Class,
      )

      expect(childRegistry.has(token)).toBe(true)
    })
  })

  describe('get', () => {
    it('should return factory record for registered token', () => {
      const token = InjectionToken.create<string>('test')
      class TestClass {}

      registry.set(
        token,
        InjectableScope.Singleton,
        TestClass,
        InjectableType.Class,
        10,
      )

      const record = registry.get(token)

      expect(record.scope).toBe(InjectableScope.Singleton)
      expect(record.target).toBe(TestClass)
      expect(record.type).toBe(InjectableType.Class)
      expect(record.priority).toBe(10)
      expect(record.originalToken).toBe(token)
    })

    it('should throw for non-existent token', () => {
      const token = InjectionToken.create<string>('test')

      expect(() => registry.get(token)).toThrow()
    })

    it('should get from parent registry', () => {
      const parentRegistry = new Registry()
      const childRegistry = new Registry(parentRegistry)
      const token = InjectionToken.create<string>('test')
      class TestClass {}

      parentRegistry.set(
        token,
        InjectableScope.Singleton,
        TestClass,
        InjectableType.Class,
      )

      const record = childRegistry.get(token)
      expect(record.target).toBe(TestClass)
    })

    it('should prefer child registry over parent', () => {
      const parentRegistry = new Registry()
      const childRegistry = new Registry(parentRegistry)
      const token = InjectionToken.create<string>('test')
      class ParentClass {}
      class ChildClass {}

      parentRegistry.set(
        token,
        InjectableScope.Singleton,
        ParentClass,
        InjectableType.Class,
      )
      childRegistry.set(
        token,
        InjectableScope.Singleton,
        ChildClass,
        InjectableType.Class,
        1, // Higher priority
      )

      const record = childRegistry.get(token)
      expect(record.target).toBe(ChildClass)
    })
  })

  describe('getAll', () => {
    it('should return empty array for non-existent token', () => {
      const token = InjectionToken.create<string>('test')

      const records = registry.getAll(token)
      expect(records).toEqual([])
    })

    it('should return all records sorted by priority (highest first)', () => {
      const token = InjectionToken.create<string>('test')
      class ClassA {}
      class ClassB {}
      class ClassC {}

      registry.set(token, InjectableScope.Singleton, ClassA, InjectableType.Class, 5)
      registry.set(token, InjectableScope.Singleton, ClassB, InjectableType.Class, 10)
      registry.set(token, InjectableScope.Singleton, ClassC, InjectableType.Class, 1)

      const records = registry.getAll(token)

      expect(records).toHaveLength(3)
      expect(records[0].target).toBe(ClassB) // priority 10
      expect(records[1].target).toBe(ClassA) // priority 5
      expect(records[2].target).toBe(ClassC) // priority 1
    })

    it('should get from parent if not in child', () => {
      const parentRegistry = new Registry()
      const childRegistry = new Registry(parentRegistry)
      const token = InjectionToken.create<string>('test')
      class TestClass {}

      parentRegistry.set(
        token,
        InjectableScope.Singleton,
        TestClass,
        InjectableType.Class,
      )

      const records = childRegistry.getAll(token)
      expect(records).toHaveLength(1)
      expect(records[0].target).toBe(TestClass)
    })
  })

  describe('set', () => {
    it('should register factory with default priority 0', () => {
      const token = InjectionToken.create<string>('test')
      class TestClass {}

      registry.set(token, InjectableScope.Singleton, TestClass, InjectableType.Class)

      const record = registry.get(token)
      expect(record.priority).toBe(0)
    })

    it('should register factory with custom priority', () => {
      const token = InjectionToken.create<string>('test')
      class TestClass {}

      registry.set(
        token,
        InjectableScope.Singleton,
        TestClass,
        InjectableType.Class,
        100,
      )

      const record = registry.get(token)
      expect(record.priority).toBe(100)
    })

    it('should support multiple registrations for same token', () => {
      const token = InjectionToken.create<string>('test')
      class ClassA {}
      class ClassB {}

      registry.set(token, InjectableScope.Singleton, ClassA, InjectableType.Class, 0)
      registry.set(token, InjectableScope.Singleton, ClassB, InjectableType.Class, 1)

      const records = registry.getAll(token)
      expect(records).toHaveLength(2)
    })

    it('should update highest priority cache when new registration is higher', () => {
      const token = InjectionToken.create<string>('test')
      class ClassA {}
      class ClassB {}

      registry.set(token, InjectableScope.Singleton, ClassA, InjectableType.Class, 5)
      expect(registry.get(token).target).toBe(ClassA)

      registry.set(token, InjectableScope.Singleton, ClassB, InjectableType.Class, 10)
      expect(registry.get(token).target).toBe(ClassB)
    })

    it('should not update highest priority cache when new registration is lower', () => {
      const token = InjectionToken.create<string>('test')
      class ClassA {}
      class ClassB {}

      registry.set(token, InjectableScope.Singleton, ClassA, InjectableType.Class, 10)
      registry.set(token, InjectableScope.Singleton, ClassB, InjectableType.Class, 5)

      expect(registry.get(token).target).toBe(ClassA)
    })
  })

  describe('delete', () => {
    it('should remove token registration', () => {
      const token = InjectionToken.create<string>('test')
      class TestClass {}

      registry.set(token, InjectableScope.Singleton, TestClass, InjectableType.Class)
      expect(registry.has(token)).toBe(true)

      registry.delete(token)
      expect(registry.has(token)).toBe(false)
    })

    it('should handle deleting non-existent token', () => {
      const token = InjectionToken.create<string>('test')

      // Should not throw
      registry.delete(token)
    })

    it('should remove highest priority and keep lower priority registrations', () => {
      const token = InjectionToken.create<string>('test')
      class ClassA {}
      class ClassB {}

      registry.set(token, InjectableScope.Singleton, ClassA, InjectableType.Class, 5)
      registry.set(token, InjectableScope.Singleton, ClassB, InjectableType.Class, 10)

      expect(registry.get(token).target).toBe(ClassB)
      expect(registry.getAll(token)).toHaveLength(2)

      // Delete removes highest priority and recalculates
      registry.delete(token)

      // Lower priority registration (ClassA) should remain
      expect(registry.getAll(token)).toHaveLength(1)
      expect(registry.get(token).target).toBe(ClassA)
    })
  })

  describe('updateScope', () => {
    it('should update scope of registered token', () => {
      const token = InjectionToken.create<string>('test')
      class TestClass {}

      registry.set(token, InjectableScope.Singleton, TestClass, InjectableType.Class)
      expect(registry.get(token).scope).toBe(InjectableScope.Singleton)

      const result = registry.updateScope(token, InjectableScope.Request)

      expect(result).toBe(true)
      expect(registry.get(token).scope).toBe(InjectableScope.Request)
    })

    it('should return false for non-existent token', () => {
      const token = InjectionToken.create<string>('test')

      const result = registry.updateScope(token, InjectableScope.Request)

      expect(result).toBe(false)
    })

    it('should update all records for the token', () => {
      const token = InjectionToken.create<string>('test')
      class ClassA {}
      class ClassB {}

      registry.set(token, InjectableScope.Singleton, ClassA, InjectableType.Class, 0)
      registry.set(token, InjectableScope.Singleton, ClassB, InjectableType.Class, 1)

      registry.updateScope(token, InjectableScope.Request)

      const records = registry.getAll(token)
      expect(records[0].scope).toBe(InjectableScope.Request)
      expect(records[1].scope).toBe(InjectableScope.Request)
    })

    it('should delegate to parent if not found in child', () => {
      const parentRegistry = new Registry()
      const childRegistry = new Registry(parentRegistry)
      const token = InjectionToken.create<string>('test')
      class TestClass {}

      parentRegistry.set(
        token,
        InjectableScope.Singleton,
        TestClass,
        InjectableType.Class,
      )

      const result = childRegistry.updateScope(token, InjectableScope.Transient)

      expect(result).toBe(true)
      expect(parentRegistry.get(token).scope).toBe(InjectableScope.Transient)
    })
  })

  describe('priority system', () => {
    it('should respect priority when getting the active registration', () => {
      const token = InjectionToken.create<string>('test')
      class DefaultImpl {}
      class OverrideImpl {}
      class HighPriorityImpl {}

      registry.set(
        token,
        InjectableScope.Singleton,
        DefaultImpl,
        InjectableType.Class,
        0,
      )
      registry.set(
        token,
        InjectableScope.Singleton,
        OverrideImpl,
        InjectableType.Class,
        1,
      )
      registry.set(
        token,
        InjectableScope.Singleton,
        HighPriorityImpl,
        InjectableType.Class,
        100,
      )

      expect(registry.get(token).target).toBe(HighPriorityImpl)
    })

    it('should use first registration if priorities are equal', () => {
      const token = InjectionToken.create<string>('test')
      class FirstImpl {}
      class SecondImpl {}

      registry.set(
        token,
        InjectableScope.Singleton,
        FirstImpl,
        InjectableType.Class,
        5,
      )
      registry.set(
        token,
        InjectableScope.Singleton,
        SecondImpl,
        InjectableType.Class,
        5,
      )

      // With equal priority, the first one stays as highest
      expect(registry.get(token).target).toBe(FirstImpl)
    })

    it('should support negative priorities', () => {
      const token = InjectionToken.create<string>('test')
      class LowPriority {}
      class DefaultPriority {}

      registry.set(
        token,
        InjectableScope.Singleton,
        LowPriority,
        InjectableType.Class,
        -10,
      )
      registry.set(
        token,
        InjectableScope.Singleton,
        DefaultPriority,
        InjectableType.Class,
        0,
      )

      expect(registry.get(token).target).toBe(DefaultPriority)
    })
  })

  describe('factory types', () => {
    it('should support Class type factories', () => {
      const token = InjectionToken.create<string>('test')
      class TestClass {}

      registry.set(token, InjectableScope.Singleton, TestClass, InjectableType.Class)

      expect(registry.get(token).type).toBe(InjectableType.Class)
    })

    it('should support Factory type factories', () => {
      const token = InjectionToken.create<string>('test')
      class TestFactory {
        create() {
          return 'test'
        }
      }

      registry.set(
        token,
        InjectableScope.Singleton,
        TestFactory,
        InjectableType.Factory,
      )

      expect(registry.get(token).type).toBe(InjectableType.Factory)
    })
  })

  describe('globalRegistry', () => {
    it('should be a singleton Registry instance', () => {
      expect(globalRegistry).toBeInstanceOf(Registry)
    })

    it('should not have a parent', () => {
      // We can verify this indirectly by checking that non-existent tokens
      // throw without delegating to a parent
      const token = InjectionToken.create<string>('non-existent-global-test')
      expect(() => globalRegistry.get(token)).toThrow()
    })
  })

  describe('parent-child relationship', () => {
    it('should allow overriding parent registrations in child', () => {
      const parent = new Registry()
      const child = new Registry(parent)
      const token = InjectionToken.create<string>('test')
      class ParentImpl {}
      class ChildImpl {}

      parent.set(token, InjectableScope.Singleton, ParentImpl, InjectableType.Class)
      child.set(
        token,
        InjectableScope.Request,
        ChildImpl,
        InjectableType.Class,
        1,
      )

      // Child should return its own registration
      expect(child.get(token).target).toBe(ChildImpl)
      expect(child.get(token).scope).toBe(InjectableScope.Request)

      // Parent should still have its original registration
      expect(parent.get(token).target).toBe(ParentImpl)
    })

    it('should support multi-level hierarchy', () => {
      const grandparent = new Registry()
      const parent = new Registry(grandparent)
      const child = new Registry(parent)
      const token = InjectionToken.create<string>('test')
      class TestClass {}

      grandparent.set(
        token,
        InjectableScope.Singleton,
        TestClass,
        InjectableType.Class,
      )

      expect(child.has(token)).toBe(true)
      expect(child.get(token).target).toBe(TestClass)
    })
  })
})
