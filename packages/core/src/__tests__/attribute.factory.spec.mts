import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import { AttributeFactory } from '../attribute.factory.mjs'

import type { ControllerMetadata, HandlerMetadata, ModuleMetadata } from '../metadata/index.mjs'

// Helper to create mock metadata objects
const createMockMetadata = (
  attributes: Map<symbol, any> = new Map(),
): ModuleMetadata | ControllerMetadata | HandlerMetadata<any> =>
  ({
    customAttributes: attributes,
  }) as any

describe('AttributeFactory', () => {
  describe('createAttribute', () => {
    it('should create a simple attribute without schema', () => {
      const token = Symbol.for('TestAttribute')
      const attribute = AttributeFactory.createAttribute(token)

      expect(attribute.token).toBe(token)
      expect(typeof attribute).toBe('function')
    })

    it('should create an attribute with schema', () => {
      const token = Symbol.for('SchemaAttribute')
      const schema = z.object({ value: z.number() })
      const attribute = AttributeFactory.createAttribute(token, schema)

      expect(attribute.token).toBe(token)
      expect(attribute.schema).toBe(schema)
      expect(typeof attribute).toBe('function')
    })
  })

  describe('get', () => {
    it('should return true for simple attribute when present', () => {
      const token = Symbol.for('SimpleAttribute')
      const attribute = AttributeFactory.createAttribute(token)

      const metadata = createMockMetadata(new Map([[token, true]]))

      const result = AttributeFactory.get(attribute, metadata)

      expect(result).toBe(true)
    })

    it('should return null when attribute is not present', () => {
      const token = Symbol.for('MissingAttribute')
      const attribute = AttributeFactory.createAttribute(token)

      const metadata = createMockMetadata()

      const result = AttributeFactory.get(attribute, metadata)

      expect(result).toBeNull()
    })

    it('should return validated value for schema attribute', () => {
      const token = Symbol.for('RateLimitAttribute')
      const schema = z.object({ requests: z.number(), window: z.number() })
      const attribute = AttributeFactory.createAttribute(token, schema)

      const value = { requests: 100, window: 60000 }
      const metadata = createMockMetadata(new Map([[token, value]]))

      const result = AttributeFactory.get(attribute, metadata)

      expect(result).toEqual(value)
    })

    it('should work with different metadata types (module)', () => {
      const token = Symbol.for('ModuleAttribute')
      const attribute = AttributeFactory.createAttribute(token)

      const moduleMetadata = {
        customAttributes: new Map([[token, true]]),
        providers: [],
        controllers: new Set(),
      } as unknown as ModuleMetadata

      const result = AttributeFactory.get(attribute, moduleMetadata)

      expect(result).toBe(true)
    })

    it('should work with different metadata types (controller)', () => {
      const token = Symbol.for('ControllerAttribute')
      const attribute = AttributeFactory.createAttribute(token)

      const controllerMetadata = {
        customAttributes: new Map([[token, true]]),
        guards: new Set(),
      } as unknown as ControllerMetadata

      const result = AttributeFactory.get(attribute, controllerMetadata)

      expect(result).toBe(true)
    })

    it('should work with different metadata types (handler)', () => {
      const token = Symbol.for('HandlerAttribute')
      const attribute = AttributeFactory.createAttribute(token)

      const handlerMetadata = {
        customAttributes: new Map([[token, true]]),
        config: {},
      } as unknown as HandlerMetadata<any>

      const result = AttributeFactory.get(attribute, handlerMetadata)

      expect(result).toBe(true)
    })
  })

  describe('getAll', () => {
    it('should return array of values when attribute is present', () => {
      const token = Symbol.for('TagAttribute')
      const attribute = AttributeFactory.createAttribute(token)

      // Note: Map only stores unique keys, so getAll with Map will only return one value
      const metadata = createMockMetadata(new Map([[token, true]]))

      const result = AttributeFactory.getAll(attribute, metadata)

      expect(result).toEqual([true])
    })

    it('should return null when attribute is not present', () => {
      const token = Symbol.for('MissingAllAttribute')
      const attribute = AttributeFactory.createAttribute(token)

      const metadata = createMockMetadata()

      const result = AttributeFactory.getAll(attribute, metadata)

      expect(result).toBeNull()
    })

    it('should return array of schema values', () => {
      const token = Symbol.for('MultiValueAttribute')
      const schema = z.string()
      const attribute = AttributeFactory.createAttribute(token, schema)

      const metadata = createMockMetadata(new Map([[token, 'value1']]))

      const result = AttributeFactory.getAll(attribute, metadata)

      expect(result).toEqual(['value1'])
    })
  })

  describe('getLast', () => {
    it('should return last value from array of metadata objects', () => {
      const token = Symbol.for('HierarchyAttribute')
      const schema = z.number()
      const attribute = AttributeFactory.createAttribute(token, schema)

      const moduleMetadata = createMockMetadata(new Map([[token, 100]]))
      const controllerMetadata = createMockMetadata(new Map([[token, 200]]))
      const handlerMetadata = createMockMetadata(new Map([[token, 300]]))

      const result = AttributeFactory.getLast(attribute, [
        moduleMetadata,
        controllerMetadata,
        handlerMetadata,
      ])

      // Last one (most specific) should be returned
      expect(result).toBe(300)
    })

    it('should find value from earlier metadata if later ones are missing', () => {
      const token = Symbol.for('FallbackAttribute')
      const schema = z.number()
      const attribute = AttributeFactory.createAttribute(token, schema)

      const moduleMetadata = createMockMetadata(new Map([[token, 100]]))
      const controllerMetadata = createMockMetadata() // No attribute
      const handlerMetadata = createMockMetadata() // No attribute

      const result = AttributeFactory.getLast(attribute, [
        moduleMetadata,
        controllerMetadata,
        handlerMetadata,
      ])

      expect(result).toBe(100)
    })

    it('should return null when attribute is not present in any metadata', () => {
      const token = Symbol.for('NowhereAttribute')
      const attribute = AttributeFactory.createAttribute(token)

      const result = AttributeFactory.getLast(attribute, [
        createMockMetadata(),
        createMockMetadata(),
        createMockMetadata(),
      ])

      expect(result).toBeNull()
    })

    it('should return null for empty array', () => {
      const token = Symbol.for('EmptyArrayAttribute')
      const attribute = AttributeFactory.createAttribute(token)

      const result = AttributeFactory.getLast(attribute, [])

      expect(result).toBeNull()
    })

    it('should work with simple (boolean) attributes', () => {
      const token = Symbol.for('PublicAttribute')
      const attribute = AttributeFactory.createAttribute(token)

      const moduleMetadata = createMockMetadata()
      const controllerMetadata = createMockMetadata(new Map([[token, true]]))
      const handlerMetadata = createMockMetadata()

      const result = AttributeFactory.getLast(attribute, [
        moduleMetadata,
        controllerMetadata,
        handlerMetadata,
      ])

      expect(result).toBe(true)
    })
  })

  describe('has', () => {
    it('should return true when attribute is present', () => {
      const token = Symbol.for('ExistsAttribute')
      const attribute = AttributeFactory.createAttribute(token)

      const metadata = createMockMetadata(new Map([[token, true]]))

      const result = AttributeFactory.has(attribute, metadata)

      expect(result).toBe(true)
    })

    it('should return false when attribute is not present', () => {
      const token = Symbol.for('NotExistsAttribute')
      const attribute = AttributeFactory.createAttribute(token)

      const metadata = createMockMetadata()

      const result = AttributeFactory.has(attribute, metadata)

      expect(result).toBe(false)
    })

    it('should return true for schema attribute when present', () => {
      const token = Symbol.for('SchemaExistsAttribute')
      const schema = z.object({ key: z.string() })
      const attribute = AttributeFactory.createAttribute(token, schema)

      const metadata = createMockMetadata(new Map([[token, { key: 'value' }]]))

      const result = AttributeFactory.has(attribute, metadata)

      expect(result).toBe(true)
    })

    it('should return false for schema attribute when not present', () => {
      const token = Symbol.for('SchemaNotExistsAttribute')
      const schema = z.object({ key: z.string() })
      const attribute = AttributeFactory.createAttribute(token, schema)

      const metadata = createMockMetadata()

      const result = AttributeFactory.has(attribute, metadata)

      expect(result).toBe(false)
    })
  })

  describe('type safety', () => {
    it('should return correctly typed value for schema attributes', () => {
      const token = Symbol.for('TypedAttribute')
      const schema = z.object({
        requests: z.number(),
        window: z.number(),
      })
      const attribute = AttributeFactory.createAttribute(token, schema)

      const value = { requests: 100, window: 60000 }
      const metadata = createMockMetadata(new Map([[token, value]]))

      const result = AttributeFactory.get(attribute, metadata)

      // TypeScript should infer: { requests: number, window: number } | null
      if (result) {
        expect(typeof result.requests).toBe('number')
        expect(typeof result.window).toBe('number')
      }
    })
  })
})
