import { describe, expect, it } from 'vitest'

import {
  getTracedMetadata,
  hasTracedMetadata,
  Traced,
  TRACED_METADATA_KEY,
} from '../decorators/traced.decorator.mjs'

describe('@Traced decorator', () => {
  describe('class decorator', () => {
    it('should attach metadata to class', () => {
      @Traced({ name: 'test-service' })
      class TestService {
        doWork() {
          return 'work'
        }
      }

      expect(hasTracedMetadata(TestService)).toBe(true)

      const metadata = getTracedMetadata(TestService)
      expect(metadata).toBeDefined()
      expect(metadata?.name).toBe('test-service')
      expect(metadata?.enabled).toBe(true)
    })

    it('should work without options', () => {
      @Traced()
      class TestService {
        doWork() {
          return 'work'
        }
      }

      expect(hasTracedMetadata(TestService)).toBe(true)

      const metadata = getTracedMetadata(TestService)
      expect(metadata).toBeDefined()
      expect(metadata?.name).toBeUndefined()
      expect(metadata?.enabled).toBe(true)
    })

    it('should support custom attributes', () => {
      @Traced({
        name: 'custom-service',
        attributes: { 'custom.key': 'custom-value' },
      })
      class TestService {
        doWork() {
          return 'work'
        }
      }

      const metadata = getTracedMetadata(TestService)
      expect(metadata?.attributes).toEqual({ 'custom.key': 'custom-value' })
    })
  })

  describe('method decorator', () => {
    it('should add method metadata via addInitializer', () => {
      class TestService {
        @Traced({ name: 'custom-method' })
        tracedMethod() {
          return 'traced'
        }

        untracedMethod() {
          return 'untraced'
        }
      }

      // Create instance to trigger initializers
      const instance = new TestService()
      expect(instance.tracedMethod()).toBe('traced')

      // Check class metadata was created
      const metadata = getTracedMetadata(TestService)
      expect(metadata).toBeDefined()

      // The class itself isn't fully traced (enabled: false)
      // but it has method-specific metadata
      expect(metadata?.methods.has('tracedMethod')).toBe(true)

      const methodMeta = metadata?.methods.get('tracedMethod')
      expect(methodMeta?.name).toBe('custom-method')
      expect(methodMeta?.enabled).toBe(true)
    })

    it('should support multiple method decorators', () => {
      class TestService {
        @Traced({ name: 'method-one' })
        methodOne() {
          return 1
        }

        @Traced({ name: 'method-two' })
        methodTwo() {
          return 2
        }

        methodThree() {
          return 3
        }
      }

      // Create instance to trigger initializers
      new TestService()

      const metadata = getTracedMetadata(TestService)
      expect(metadata?.methods.size).toBe(2)
      expect(metadata?.methods.has('methodOne')).toBe(true)
      expect(metadata?.methods.has('methodTwo')).toBe(true)
      expect(metadata?.methods.has('methodThree')).toBe(false)
    })
  })

  describe('combined class and method decorators', () => {
    it('should allow method overrides on traced class', () => {
      @Traced({ name: 'parent-service' })
      class TestService {
        defaultMethod() {
          return 'default'
        }

        @Traced({ name: 'overridden-method' })
        overriddenMethod() {
          return 'overridden'
        }
      }

      // Create instance to trigger initializers
      new TestService()

      const metadata = getTracedMetadata(TestService)
      expect(metadata?.name).toBe('parent-service')
      expect(metadata?.enabled).toBe(true)

      // Method override should be present
      expect(metadata?.methods.has('overriddenMethod')).toBe(true)
      expect(metadata?.methods.get('overriddenMethod')?.name).toBe(
        'overridden-method',
      )
    })
  })

  describe('metadata key', () => {
    it('should use correct symbol key', () => {
      @Traced()
      class TestService {}

      expect((TestService as any)[TRACED_METADATA_KEY]).toBeDefined()
    })
  })
})
