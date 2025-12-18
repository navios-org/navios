import { beforeEach, describe, expect, it } from 'vitest'

import { InjectableScope, InjectableType } from '../enums/index.mjs'
import { InjectionToken } from '../token/injection-token.mjs'
import { globalRegistry, Registry } from '../token/registry.mjs'

class TestService {}
class AnotherService {}

describe('Registry', () => {
  let registry: Registry
  let token1: InjectionToken<TestService, undefined>
  let token2: InjectionToken<AnotherService, undefined>

  beforeEach(() => {
    registry = new Registry()
    token1 = new InjectionToken<TestService, undefined>(
      'TestService',
      undefined,
    )
    token2 = new InjectionToken<AnotherService, undefined>(
      'AnotherService',
      undefined,
    )
  })

  describe('constructor', () => {
    it('should create registry without parent', () => {
      const reg = new Registry()
      expect(reg).toBeDefined()
    })

    it('should create registry with parent', () => {
      const parentRegistry = new Registry()
      const childRegistry = new Registry(parentRegistry)
      expect(childRegistry).toBeDefined()
    })
  })

  describe('set', () => {
    it('should set factory record for token', () => {
      registry.set(
        token1,
        InjectableScope.Singleton,
        TestService,
        InjectableType.Class,
      )

      expect(registry.has(token1)).toBe(true)
    })

    it('should set multiple factory records', () => {
      registry.set(
        token1,
        InjectableScope.Singleton,
        TestService,
        InjectableType.Class,
      )
      registry.set(
        token2,
        InjectableScope.Transient,
        AnotherService,
        InjectableType.Factory,
      )

      expect(registry.has(token1)).toBe(true)
      expect(registry.has(token2)).toBe(true)
    })

    it('should overwrite existing factory record', () => {
      registry.set(
        token1,
        InjectableScope.Singleton,
        TestService,
        InjectableType.Class,
      )
      registry.set(
        token1,
        InjectableScope.Transient,
        TestService,
        InjectableType.Factory,
      )

      const record = registry.get(token1)
      expect(record.scope).toBe(InjectableScope.Transient)
      expect(record.type).toBe(InjectableType.Factory)
    })
  })

  describe('has', () => {
    it('should return false for non-existent token', () => {
      expect(registry.has(token1)).toBe(false)
    })

    it('should return true for existing token', () => {
      registry.set(
        token1,
        InjectableScope.Singleton,
        TestService,
        InjectableType.Class,
      )
      expect(registry.has(token1)).toBe(true)
    })

    it('should check parent registry when token not found locally', () => {
      const parentRegistry = new Registry()
      const childRegistry = new Registry(parentRegistry)

      parentRegistry.set(
        token1,
        InjectableScope.Singleton,
        TestService,
        InjectableType.Class,
      )

      expect(childRegistry.has(token1)).toBe(true)
    })

    it('should return false when token not found in parent chain', () => {
      const parentRegistry = new Registry()
      const childRegistry = new Registry(parentRegistry)

      expect(childRegistry.has(token1)).toBe(false)
    })

    it('should prioritize local registry over parent', () => {
      const parentRegistry = new Registry()
      const childRegistry = new Registry(parentRegistry)

      parentRegistry.set(
        token1,
        InjectableScope.Singleton,
        TestService,
        InjectableType.Class,
      )
      childRegistry.set(
        token1,
        InjectableScope.Transient,
        TestService,
        InjectableType.Factory,
      )

      expect(childRegistry.has(token1)).toBe(true)
      const record = childRegistry.get(token1)
      expect(record.scope).toBe(InjectableScope.Transient) // From child registry
    })
  })

  describe('get', () => {
    it('should return factory record for existing token', () => {
      registry.set(
        token1,
        InjectableScope.Singleton,
        TestService,
        InjectableType.Class,
      )

      const record = registry.get(token1)
      expect(record.scope).toBe(InjectableScope.Singleton)
      expect(record.target).toBe(TestService)
      expect(record.type).toBe(InjectableType.Class)
      expect(record.originalToken).toBe(token1)
    })

    it('should throw error for non-existent token', () => {
      expect(() => {
        registry.get(token1)
      }).toThrow(`[Registry] No factory found for ${token1.toString()}`)
    })

    it('should get from parent registry when not found locally', () => {
      const parentRegistry = new Registry()
      const childRegistry = new Registry(parentRegistry)

      parentRegistry.set(
        token1,
        InjectableScope.Singleton,
        TestService,
        InjectableType.Class,
      )

      const record = childRegistry.get(token1)
      expect(record.scope).toBe(InjectableScope.Singleton)
      expect(record.target).toBe(TestService)
    })

    it('should throw error when token not found in parent chain', () => {
      const parentRegistry = new Registry()
      const childRegistry = new Registry(parentRegistry)

      expect(() => {
        childRegistry.get(token1)
      }).toThrow(`[Registry] No factory found for ${token1.toString()}`)
    })

    it('should prioritize local registry over parent', () => {
      const parentRegistry = new Registry()
      const childRegistry = new Registry(parentRegistry)

      parentRegistry.set(
        token1,
        InjectableScope.Singleton,
        TestService,
        InjectableType.Class,
      )
      childRegistry.set(
        token1,
        InjectableScope.Transient,
        AnotherService,
        InjectableType.Factory,
      )

      const record = childRegistry.get(token1)
      expect(record.scope).toBe(InjectableScope.Transient)
      expect(record.target).toBe(AnotherService)
      expect(record.type).toBe(InjectableType.Factory)
    })
  })

  describe('delete', () => {
    it('should delete existing token', () => {
      registry.set(
        token1,
        InjectableScope.Singleton,
        TestService,
        InjectableType.Class,
      )
      expect(registry.has(token1)).toBe(true)

      registry.delete(token1)
      expect(registry.has(token1)).toBe(false)
    })

    it('should not affect parent registry when deleting from child', () => {
      const parentRegistry = new Registry()
      const childRegistry = new Registry(parentRegistry)

      parentRegistry.set(
        token1,
        InjectableScope.Singleton,
        TestService,
        InjectableType.Class,
      )
      childRegistry.set(
        token1,
        InjectableScope.Transient,
        AnotherService,
        InjectableType.Factory,
      )

      childRegistry.delete(token1)

      // Child should no longer have it
      expect(childRegistry.has(token1)).toBe(true) // Still true because it exists in parent
      // But getting it should return parent's version
      const record = childRegistry.get(token1)
      expect(record.scope).toBe(InjectableScope.Singleton) // From parent
    })

    it('should handle delete for non-existent token gracefully', () => {
      expect(() => {
        registry.delete(token1)
      }).not.toThrow()
    })
  })

  describe('complex parent-child scenarios', () => {
    it('should handle deep hierarchy', () => {
      const grandParent = new Registry()
      const parent = new Registry(grandParent)
      const child = new Registry(parent)

      grandParent.set(
        token1,
        InjectableScope.Singleton,
        TestService,
        InjectableType.Class,
      )

      expect(child.has(token1)).toBe(true)
      const record = child.get(token1)
      expect(record.scope).toBe(InjectableScope.Singleton)
    })

    it('should handle overriding at different levels', () => {
      const grandParent = new Registry()
      const parent = new Registry(grandParent)
      const child = new Registry(parent)

      grandParent.set(
        token1,
        InjectableScope.Singleton,
        TestService,
        InjectableType.Class,
      )
      parent.set(
        token1,
        InjectableScope.Transient,
        AnotherService,
        InjectableType.Factory,
      )

      const record = child.get(token1)
      expect(record.scope).toBe(InjectableScope.Transient) // From parent, not grandparent
      expect(record.target).toBe(AnotherService)
    })
  })
})

describe('globalRegistry', () => {
  it('should be a Registry instance', () => {
    expect(globalRegistry).toBeInstanceOf(Registry)
  })

  it('should be able to store and retrieve tokens', () => {
    const token = new InjectionToken<TestService, undefined>(
      'GlobalTest',
      undefined,
    )

    globalRegistry.set(
      token,
      InjectableScope.Singleton,
      TestService,
      InjectableType.Class,
    )
    expect(globalRegistry.has(token)).toBe(true)

    const record = globalRegistry.get(token)
    expect(record.target).toBe(TestService)

    // Clean up
    globalRegistry.delete(token)
  })
})
