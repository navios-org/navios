import { TestContainer } from '@navios/core/testing'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import { PathBuilderService } from '../services/path-builder.service.mjs'
import { SchemaConverterService } from '../services/schema-converter.service.mjs'

describe('OpenAPI Services', () => {
  let container: TestContainer

  beforeEach(() => {
    container = new TestContainer()
  })

  afterEach(async () => {
    await container.dispose()
  })

  describe('SchemaConverterService', () => {
    it('should convert string schema', async () => {
      const service = await container.get(SchemaConverterService)
      const schema = z.string()
      const result = service.convert(schema)

      expect(result.schema).toEqual({ type: 'string' })
    })

    it('should convert number schema', async () => {
      const service = await container.get(SchemaConverterService)
      const schema = z.number()
      const result = service.convert(schema)

      expect(result.schema).toEqual({ type: 'number' })
    })

    it('should convert boolean schema', async () => {
      const service = await container.get(SchemaConverterService)
      const schema = z.boolean()
      const result = service.convert(schema)

      expect(result.schema).toEqual({ type: 'boolean' })
    })

    it('should convert object schema', async () => {
      const service = await container.get(SchemaConverterService)
      const schema = z.object({
        id: z.string(),
        name: z.string(),
        age: z.number().optional(),
      })
      const result = service.convert(schema)

      expect(result.schema).toMatchObject({
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['id', 'name'],
      })
    })

    it('should convert array schema', async () => {
      const service = await container.get(SchemaConverterService)
      const schema = z.array(z.string())
      const result = service.convert(schema)

      expect(result.schema).toMatchObject({
        type: 'array',
        items: { type: 'string' },
      })
    })

    it('should convert enum schema', async () => {
      const service = await container.get(SchemaConverterService)
      const schema = z.enum(['admin', 'user', 'guest'])
      const result = service.convert(schema)

      expect(result.schema).toMatchObject({
        type: 'string',
        enum: ['admin', 'user', 'guest'],
      })
    })

    it('should convert union schema', async () => {
      const service = await container.get(SchemaConverterService)
      const schema = z.union([z.string(), z.number()])
      const result = service.convert(schema)

      expect(result.schema).toMatchObject({
        anyOf: [{ type: 'string' }, { type: 'number' }],
      })
    })

    it('should handle nullable schema', async () => {
      const service = await container.get(SchemaConverterService)
      const schema = z.string().nullable()
      const result = service.convert(schema)

      // zod-openapi uses anyOf for nullable types in OpenAPI 3.1
      expect(result.schema).toMatchObject({
        anyOf: [{ type: 'string' }, { type: 'null' }],
      })
    })

    it('should handle email format', async () => {
      const service = await container.get(SchemaConverterService)
      const schema = z.string().email()
      const result = service.convert(schema)

      expect(result.schema).toMatchObject({
        type: 'string',
        format: 'email',
      })
    })

    it('should handle uuid format', async () => {
      const service = await container.get(SchemaConverterService)
      const schema = z.string().uuid()
      const result = service.convert(schema)

      expect(result.schema).toMatchObject({
        type: 'string',
        format: 'uuid',
      })
    })

    it('should handle date schema', async () => {
      const service = await container.get(SchemaConverterService)
      const schema = z.date()
      const result = service.convert(schema)

      // zod-openapi converts z.date() to just string type
      expect(result.schema).toMatchObject({
        type: 'string',
      })
    })

    it('should handle nested objects', async () => {
      const service = await container.get(SchemaConverterService)
      const schema = z.object({
        user: z.object({
          id: z.string(),
          profile: z.object({
            bio: z.string().optional(),
          }),
        }),
      })
      const result = service.convert(schema)

      expect(result.schema).toMatchObject({
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              profile: {
                type: 'object',
                properties: {
                  bio: { type: 'string' },
                },
              },
            },
          },
        },
      })
    })
  })

  describe('PathBuilderService', () => {
    it('should convert $param to {param} format', async () => {
      const service = await container.get(PathBuilderService)
      expect(service.convertUrlParams('/users/$userId')).toBe('/users/{userId}')
    })

    it('should convert multiple params', async () => {
      const service = await container.get(PathBuilderService)
      expect(service.convertUrlParams('/users/$userId/posts/$postId')).toBe(
        '/users/{userId}/posts/{postId}',
      )
    })

    it('should handle URLs without params', async () => {
      const service = await container.get(PathBuilderService)
      expect(service.convertUrlParams('/users')).toBe('/users')
    })

    it('should handle params at the end', async () => {
      const service = await container.get(PathBuilderService)
      expect(service.convertUrlParams('/files/$fileId/download')).toBe('/files/{fileId}/download')
    })

    it('should extract single param', async () => {
      const service = await container.get(PathBuilderService)
      expect(service.extractUrlParamNames('/users/$userId')).toEqual(['userId'])
    })

    it('should extract multiple params', async () => {
      const service = await container.get(PathBuilderService)
      expect(service.extractUrlParamNames('/users/$userId/posts/$postId')).toEqual([
        'userId',
        'postId',
      ])
    })

    it('should return empty array for no params', async () => {
      const service = await container.get(PathBuilderService)
      expect(service.extractUrlParamNames('/users')).toEqual([])
    })
  })
})
