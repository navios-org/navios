import { describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import { makeConfig, makeFormData } from '../make-config.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

describe('makeConfig', () => {
  const responseSchema = z.object({ id: z.string() })

  describe('basic configuration', () => {
    it('should create request config with method and url', () => {
      const config = makeConfig(
        {} as any,
        {
          method: 'GET',
          url: '/users',
          responseSchema,
        } as any,
        'GET',
        '/users',
      )

      expect(config.method).toBe('GET')
      expect(config.url).toBe('/users')
    })

    it('should preserve extra request properties', () => {
      const config = makeConfig(
        {
          headers: { Authorization: 'Bearer token' },
          signal: null,
        } as any,
        {
          method: 'GET',
          url: '/users',
          responseSchema,
        } as any,
        'GET',
        '/users',
      )

      expect(config.headers).toEqual({ Authorization: 'Bearer token' })
      expect(config.signal).toBeNull()
    })
  })

  describe('with querySchema', () => {
    const querySchema = z.object({
      page: z.number(),
      limit: z.number(),
    })

    it('should parse and include query params', () => {
      const config = makeConfig(
        { params: { page: 1, limit: 10 } } as any,
        {
          method: 'GET',
          url: '/users',
          querySchema,
          responseSchema,
        } as any,
        'GET',
        '/users',
      )

      expect(config.params).toEqual({ page: 1, limit: 10 })
    })

    it('should validate query params with schema', () => {
      const schemaWithCoercion = z.object({
        page: z.coerce.number(),
        limit: z.coerce.number(),
      })

      const config = makeConfig(
        { params: { page: '1', limit: '10' } } as any,
        {
          method: 'GET',
          url: '/users',
          querySchema: schemaWithCoercion,
          responseSchema,
        } as any,
        'GET',
        '/users',
      )

      expect(config.params).toEqual({ page: 1, limit: 10 })
    })

    it('should return empty object when no querySchema and no params', () => {
      const config = makeConfig(
        {} as any,
        {
          method: 'GET',
          url: '/users',
          responseSchema,
        } as any,
        'GET',
        '/users',
      )

      expect(config.params).toEqual({})
    })
  })

  describe('with requestSchema', () => {
    const requestSchema = z.object({
      name: z.string(),
      email: z.string().email(),
    })

    it('should parse and include request data', () => {
      const config = makeConfig(
        { data: { name: 'John', email: 'john@example.com' } } as any,
        {
          method: 'POST',
          url: '/users',
          requestSchema,
          responseSchema,
        } as any,
        'POST',
        '/users',
      )

      expect(config.data).toEqual({ name: 'John', email: 'john@example.com' })
    })

    it('should transform data with schema', () => {
      const schemaWithTransform = z.object({
        name: z.string().transform((s) => s.trim()),
        count: z.coerce.number(),
      })

      const config = makeConfig(
        { data: { name: '  John  ', count: '42' } } as any,
        {
          method: 'POST',
          url: '/users',
          requestSchema: schemaWithTransform,
          responseSchema,
        } as any,
        'POST',
        '/users',
      )

      expect(config.data).toEqual({ name: 'John', count: 42 })
    })

    it('should set data to undefined when no requestSchema', () => {
      const config = makeConfig(
        {} as any,
        {
          method: 'GET',
          url: '/users',
          responseSchema,
        } as any,
        'GET',
        '/users',
      )

      expect(config.data).toBeUndefined()
    })
  })

  describe('multipart mode', () => {
    const requestSchema = z.object({
      name: z.string(),
      file: z.instanceof(File),
    })

    it('should create FormData when isMultipart is true', () => {
      const file = new File(['content'], 'test.txt', { type: 'text/plain' })

      const config = makeConfig(
        { data: { name: 'Test', file } } as any,
        {
          method: 'POST',
          url: '/upload',
          requestSchema,
          responseSchema,
        } as any,
        'POST',
        '/upload',
        true,
      )

      expect(config.data).toBeInstanceOf(FormData)
      const formData = config.data as FormData
      expect(formData.get('name')).toBe('Test')
      expect(formData.get('file')).toBeInstanceOf(File)
    })
  })

  describe('combined schemas', () => {
    const querySchema = z.object({ page: z.number() })
    const requestSchema = z.object({ name: z.string() })

    it('should handle both querySchema and requestSchema', () => {
      const config = makeConfig(
        {
          params: { page: 1 },
          data: { name: 'John' },
        } as any,
        {
          method: 'POST',
          url: '/users',
          querySchema,
          requestSchema,
          responseSchema,
        } as any,
        'POST',
        '/users',
      )

      expect(config.params).toEqual({ page: 1 })
      expect(config.data).toEqual({ name: 'John' })
    })
  })
})

describe('makeFormData', () => {
  describe('basic types', () => {
    it('should handle string values', () => {
      const formData = makeFormData({ data: { name: 'John' } } as any, {} as any)

      expect(formData.get('name')).toBe('John')
    })

    it('should handle number values', () => {
      const formData = makeFormData({ data: { count: 42 } } as any, {} as any)

      expect(formData.get('count')).toBe('42')
    })

    it('should handle boolean values', () => {
      const formData = makeFormData({ data: { active: true, disabled: false } } as any, {} as any)

      expect(formData.get('active')).toBe('true')
      expect(formData.get('disabled')).toBe('false')
    })

    it('should handle null values as empty string', () => {
      const formData = makeFormData({ data: { value: null } } as any, {} as any)

      expect(formData.get('value')).toBe('')
    })

    it('should handle undefined values as empty string', () => {
      const formData = makeFormData({ data: { value: undefined } } as any, {} as any)

      expect(formData.get('value')).toBe('')
    })
  })

  describe('File handling', () => {
    it('should handle File objects', () => {
      const file = new File(['content'], 'test.txt', { type: 'text/plain' })

      const formData = makeFormData({ data: { file } } as any, {} as any)

      const result = formData.get('file') as File
      expect(result).toBeInstanceOf(File)
      expect(result.name).toBe('test.txt')
    })

    it('should handle multiple files in an array', () => {
      const file1 = new File(['content1'], 'file1.txt', { type: 'text/plain' })
      const file2 = new File(['content2'], 'file2.txt', { type: 'text/plain' })

      const formData = makeFormData({ data: { files: [file1, file2] } } as any, {} as any)

      const files = formData.getAll('files') as File[]
      expect(files).toHaveLength(2)
      expect(files[0].name).toBe('file1.txt')
      expect(files[1].name).toBe('file2.txt')
    })
  })

  describe('Date handling', () => {
    it('should convert Date to ISO string', () => {
      const date = new Date('2024-01-15T12:00:00.000Z')

      const formData = makeFormData({ data: { createdAt: date } } as any, {} as any)

      expect(formData.get('createdAt')).toBe('2024-01-15T12:00:00.000Z')
    })
  })

  describe('object handling', () => {
    it('should JSON stringify plain objects', () => {
      const formData = makeFormData(
        { data: { metadata: { key: 'value', nested: { a: 1 } } } } as any,
        {} as any,
      )

      expect(formData.get('metadata')).toBe('{"key":"value","nested":{"a":1}}')
    })

    it('should use toISOString if available', () => {
      const customDate = {
        toISOString: () => '2024-custom-date',
      }

      const formData = makeFormData({ data: { date: customDate } } as any, {} as any)

      expect(formData.get('date')).toBe('2024-custom-date')
    })

    it('should use toJSON if available and no toISOString', () => {
      const customObject = {
        toJSON: () => ({ serialized: true }),
      }

      const formData = makeFormData({ data: { obj: customObject } } as any, {} as any)

      expect(formData.get('obj')).toBe('{"serialized":true}')
    })
  })

  describe('array handling', () => {
    it('should handle array of strings', () => {
      const formData = makeFormData({ data: { tags: ['a', 'b', 'c'] } } as any, {} as any)

      const tags = formData.getAll('tags')
      expect(tags).toEqual(['a', 'b', 'c'])
    })

    it('should handle array of numbers', () => {
      const formData = makeFormData({ data: { ids: [1, 2, 3] } } as any, {} as any)

      const ids = formData.getAll('ids')
      expect(ids).toEqual(['1', '2', '3'])
    })

    it('should handle mixed array with files and other types', () => {
      const file = new File(['content'], 'test.txt', { type: 'text/plain' })

      const formData = makeFormData({ data: { items: [file, 'text', 123] } } as any, {} as any)

      const items = formData.getAll('items')
      expect(items).toHaveLength(3)
      expect(items[0]).toBeInstanceOf(File)
      expect(items[1]).toBe('text')
      expect(items[2]).toBe('123')
    })
  })

  describe('with requestSchema validation', () => {
    it('should validate data with schema before creating FormData', () => {
      const requestSchema = z.object({
        name: z.string(),
        count: z.coerce.number(),
      })

      const formData = makeFormData(
        { data: { name: 'Test', count: '42' } } as any,
        { requestSchema } as any,
      )

      expect(formData.get('name')).toBe('Test')
      expect(formData.get('count')).toBe('42')
    })

    it('should transform data with schema', () => {
      const requestSchema = z.object({
        name: z.string().transform((s) => s.toUpperCase()),
      })

      const formData = makeFormData({ data: { name: 'test' } } as any, { requestSchema } as any)

      expect(formData.get('name')).toBe('TEST')
    })
  })
})
