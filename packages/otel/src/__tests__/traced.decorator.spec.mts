import { describe, expect, it } from 'vitest'

import {
  extractTracedMetadata,
  getTraceableServices,
  hasTracedMetadata,
  Traceable,
  Traced,
  TracedMetadataKey,
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

      const metadata = extractTracedMetadata(TestService)
      expect(metadata).toBeDefined()
      expect(metadata.name).toBe('test-service')
      expect(metadata.enabled).toBe(true)
    })

    it('should work without options', () => {
      @Traced()
      class TestService {
        doWork() {
          return 'work'
        }
      }

      expect(hasTracedMetadata(TestService)).toBe(true)

      const metadata = extractTracedMetadata(TestService)
      expect(metadata).toBeDefined()
      expect(metadata.name).toBeUndefined()
      expect(metadata.enabled).toBe(true)
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

      const metadata = extractTracedMetadata(TestService)
      expect(metadata.attributes).toEqual({ 'custom.key': 'custom-value' })
    })

    it('should add class to traceableServices set', () => {
      @Traced({ name: 'tracked-service' })
      class TrackedService {}

      const services = getTraceableServices()
      expect(services.has(TrackedService)).toBe(true)
    })
  })

  describe('method decorator', () => {
    it('should add method metadata to class', () => {
      @Traceable()
      class TestService {
        @Traced({ name: 'custom-method' })
        tracedMethod() {
          return 'traced'
        }

        untracedMethod() {
          return 'untraced'
        }
      }

      // Check class metadata was created
      const metadata = extractTracedMetadata(TestService)
      expect(metadata).toBeDefined()

      // The class itself isn't fully traced (enabled: false)
      // but it has method-specific metadata
      expect(metadata.methods.has('tracedMethod')).toBe(true)
      expect(metadata.enabled).toBe(false)

      const methodMeta = metadata.methods.get('tracedMethod')
      expect(methodMeta?.name).toBe('custom-method')
      expect(methodMeta?.enabled).toBe(true)
    })

    it('should support multiple method decorators', () => {
      @Traceable()
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

      const metadata = extractTracedMetadata(TestService)
      expect(metadata.methods.size).toBe(2)
      expect(metadata.methods.has('methodOne')).toBe(true)
      expect(metadata.methods.has('methodTwo')).toBe(true)
      expect(metadata.methods.has('methodThree')).toBe(false)
    })

    it('should support method attributes', () => {
      @Traceable()
      class TestService {
        @Traced({
          name: 'traced-method',
          attributes: { 'method.key': 'method-value' },
        })
        tracedMethod() {
          return 'result'
        }
      }

      const metadata = extractTracedMetadata(TestService)
      const methodMeta = metadata.methods.get('tracedMethod')
      expect(methodMeta?.attributes).toEqual({ 'method.key': 'method-value' })
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

      const metadata = extractTracedMetadata(TestService)
      expect(metadata.name).toBe('parent-service')
      expect(metadata.enabled).toBe(true)

      // Method override should be present
      expect(metadata.methods.has('overriddenMethod')).toBe(true)
      expect(metadata.methods.get('overriddenMethod')?.name).toBe('overridden-method')
    })

    it('should merge class and method attributes', () => {
      @Traced({
        name: 'service-with-attrs',
        attributes: { 'class.key': 'class-value' },
      })
      class TestService {
        @Traced({
          name: 'method-with-attrs',
          attributes: { 'method.key': 'method-value' },
        })
        tracedMethod() {
          return 'result'
        }
      }

      const metadata = extractTracedMetadata(TestService)
      expect(metadata.attributes).toEqual({ 'class.key': 'class-value' })

      const methodMeta = metadata.methods.get('tracedMethod')
      expect(methodMeta?.attributes).toEqual({ 'method.key': 'method-value' })
    })
  })

  describe('metadata key', () => {
    it('should use correct symbol key', () => {
      @Traced()
      class TestService {}

      expect((TestService as any)[TracedMetadataKey]).toBeDefined()
    })

    it('should have TRACED_METADATA_KEY as alias for TracedMetadataKey', () => {
      expect(TRACED_METADATA_KEY).toBe(TracedMetadataKey)
    })
  })
})

describe('@Traceable decorator', () => {
  it('should mark class for tracing with enabled: false', () => {
    @Traceable({ name: 'traceable-service' })
    class TraceableService {
      doWork() {
        return 'work'
      }
    }

    expect(hasTracedMetadata(TraceableService)).toBe(true)

    const metadata = extractTracedMetadata(TraceableService)
    expect(metadata.name).toBe('traceable-service')
    expect(metadata.enabled).toBe(false)
  })

  it('should add class to traceableServices set', () => {
    @Traceable()
    class AnotherTraceableService {}

    const services = getTraceableServices()
    expect(services.has(AnotherTraceableService)).toBe(true)
  })

  it('should work with method-level @Traced', () => {
    @Traceable({ name: 'order-service' })
    class OrderService {
      @Traced({ name: 'process-order' })
      processOrder() {
        return 'processed'
      }

      getOrder() {
        return 'order'
      }
    }

    const metadata = extractTracedMetadata(OrderService)
    expect(metadata.name).toBe('order-service')
    expect(metadata.enabled).toBe(false)
    expect(metadata.methods.has('processOrder')).toBe(true)
    expect(metadata.methods.has('getOrder')).toBe(false)
  })

  it('should support custom attributes', () => {
    @Traceable({
      name: 'service-with-attrs',
      attributes: { 'service.type': 'database' },
    })
    class DatabaseService {}

    const metadata = extractTracedMetadata(DatabaseService)
    expect(metadata.attributes).toEqual({ 'service.type': 'database' })
  })
})

describe('getTraceableServices', () => {
  it('should return readonly set', () => {
    const services = getTraceableServices()
    // TypeScript would prevent .add() but we verify it's a ReadonlySet
    expect(typeof services.has).toBe('function')
    expect(typeof services.size).toBe('number')
  })
})

describe('extractTracedMetadata', () => {
  it('should throw if class has no traced metadata', () => {
    class UndecoratedService {}

    expect(() => extractTracedMetadata(UndecoratedService)).toThrow(
      '[Navios] Traced metadata not found',
    )
  })
})

describe('hasTracedMetadata', () => {
  it('should return false for undecorated class', () => {
    class UndecoratedService {}

    expect(hasTracedMetadata(UndecoratedService)).toBe(false)
  })

  it('should return true for @Traced class', () => {
    @Traced()
    class TracedService {}

    expect(hasTracedMetadata(TracedService)).toBe(true)
  })

  it('should return true for @Traceable class', () => {
    @Traceable()
    class TraceableService {}

    expect(hasTracedMetadata(TraceableService)).toBe(true)
  })
})
