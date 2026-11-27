import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import type { StandardSchemaV1 } from '@navios/server'

import {
  describeMultipartFields,
  isBinarySchema,
  SchemaConverter,
  toOpenApiPath,
} from '../index.mjs'

/** A Standard Schema with validation only: no `~standard.jsonSchema`. */
function plainSchema<T>(guard: (value: unknown) => boolean): StandardSchemaV1<T, T> {
  return {
    '~standard': {
      version: 1,
      vendor: 'hand-written',
      validate: (value) =>
        guard(value) ? { value: value as T } : { issues: [{ message: 'invalid' }] },
    },
  }
}

describe('SchemaConverter', () => {
  describe('schemas with the Standard JSON Schema extension (zod)', () => {
    const convert = (schema: StandardSchemaV1) => new SchemaConverter().convert(schema, 'output')

    it('converts a string schema', () => {
      expect(convert(z.string())).toEqual({ type: 'string' })
    })

    it('converts a number schema', () => {
      expect(convert(z.number())).toEqual({ type: 'number' })
    })

    it('converts a boolean schema', () => {
      expect(convert(z.boolean())).toEqual({ type: 'boolean' })
    })

    it('converts an object schema', () => {
      const result = convert(
        z.object({ id: z.string(), name: z.string(), age: z.number().optional() }),
      )
      expect(result.type).toBe('object')
      expect(result.properties).toEqual({
        id: { type: 'string' },
        name: { type: 'string' },
        age: { type: 'number' },
      })
      expect(result.required).toEqual(['id', 'name'])
    })

    it('converts an array schema', () => {
      expect(convert(z.array(z.string()))).toEqual({ type: 'array', items: { type: 'string' } })
    })

    it('converts an enum schema', () => {
      expect(convert(z.enum(['active', 'inactive', 'pending']))).toEqual({
        type: 'string',
        enum: ['active', 'inactive', 'pending'],
      })
    })

    it('converts a union schema', () => {
      expect(convert(z.union([z.string(), z.object({ id: z.number() })])).anyOf).toHaveLength(2)
    })

    it('handles a nullable schema', () => {
      expect(convert(z.string().nullable())).toEqual({ type: ['string', 'null'] })
    })

    it('handles the email format', () => {
      expect(convert(z.email())).toMatchObject({ type: 'string', format: 'email' })
    })

    it('handles the uuid format', () => {
      expect(convert(z.uuid())).toMatchObject({ type: 'string', format: 'uuid' })
    })

    it('does not throw for a date schema', () => {
      expect(convert(z.date())).toEqual({})
    })

    it('does not throw for custom schemas', () => {
      expect(convert(z.object({ odd: z.custom<number>((value) => value === 1) }))).toMatchObject({
        type: 'object',
        properties: { odd: {} },
      })
    })

    it('handles nested objects', () => {
      const result = convert(
        z.object({ user: z.object({ profile: z.object({ name: z.string() }) }) }),
      )
      expect(result).toMatchObject({
        properties: {
          user: { properties: { profile: { properties: { name: { type: 'string' } } } } },
        },
      })
    })

    it('drops $schema, so the result can be embedded', () => {
      expect(convert(z.object({ id: z.string() }))).not.toHaveProperty('$schema')
    })

    it('uses the input side for requests and the output side for responses', () => {
      const schema = z.object({ limit: z.coerce.number().default(10) })
      const converter = new SchemaConverter()
      expect(converter.convert(schema, 'input').required).toBeUndefined()
      expect(converter.convert(schema, 'output').required).toEqual(['limit'])
    })

    it('keeps .meta() and lifts the zod-openapi style `openapi` key', () => {
      const schema = z.object({
        id: z.string().meta({ description: 'Identifier', example: 'usr_1' }),
        name: z.string().meta({ openapi: { description: 'Display name', example: 'Ann' } }),
      })
      expect(convert(schema).properties).toEqual({
        id: { type: 'string', description: 'Identifier', example: 'usr_1' },
        name: { type: 'string', description: 'Display name', example: 'Ann' },
      })
    })

    it('moves named schemas to components and points references at them', () => {
      const User = z.object({ id: z.string() }).meta({ id: 'User' })
      const converter = new SchemaConverter()
      const result = converter.convert(z.object({ owner: User, members: z.array(User) }), 'output')

      expect(result).not.toHaveProperty('$defs')
      expect(result.properties).toEqual({
        owner: { $ref: '#/components/schemas/User' },
        members: { type: 'array', items: { $ref: '#/components/schemas/User' } },
      })
      expect(converter.components.User).toMatchObject({
        type: 'object',
        properties: { id: { type: 'string' } },
      })
    })

    it('reuses a component met twice and renames a different one with the same name', () => {
      const User = z.object({ id: z.string() }).meta({ id: 'Account' })
      const converter = new SchemaConverter()
      const wrap = () => z.object({ user: User })

      converter.convert(wrap(), 'output')
      converter.convert(wrap(), 'output')
      expect(Object.keys(converter.components)).toEqual(['Account'])

      // The input side differs (no additionalProperties: false).
      const input = converter.convert(wrap(), 'input')
      expect(input.properties).toEqual({ user: { $ref: '#/components/schemas/AccountInput' } })
      expect(Object.keys(converter.components)).toEqual(['Account', 'AccountInput'])
    })
  })

  describe('schemas without the extension', () => {
    const schema = plainSchema<{ id: string }>((value) => typeof value === 'object')

    it('uses the toJsonSchema option, with the side being converted', () => {
      const toJsonSchema = vi.fn((_schema: StandardSchemaV1, io: string) => ({
        type: 'object',
        title: io,
      }))
      const onUnconvertible = vi.fn()
      const converter = new SchemaConverter({ toJsonSchema, onUnconvertible })

      expect(converter.convert(schema, 'input', 'GET /x')).toEqual({
        type: 'object',
        title: 'input',
      })
      expect(converter.convert(schema, 'output', 'GET /x')).toEqual({
        type: 'object',
        title: 'output',
      })
      expect(toJsonSchema).toHaveBeenCalledWith(schema, 'input')
      expect(onUnconvertible).not.toHaveBeenCalled()
    })

    it('gives an unconstrained schema and reports the endpoint without toJsonSchema', () => {
      const onUnconvertible = vi.fn()
      const converter = new SchemaConverter({ onUnconvertible })

      expect(converter.convert(schema, 'input', 'GET /x')).toEqual({})
      expect(onUnconvertible).toHaveBeenCalledWith('GET /x')
    })

    it('does the same when toJsonSchema does not know the schema', () => {
      const onUnconvertible = vi.fn()
      const converter = new SchemaConverter({ toJsonSchema: () => undefined, onUnconvertible })

      expect(converter.convert(schema, 'output', 'GET /y')).toEqual({})
      expect(onUnconvertible).toHaveBeenCalledWith('GET /y')
    })

    it('prefers the extension over toJsonSchema', () => {
      const toJsonSchema = vi.fn(() => ({ type: 'null' }))
      expect(new SchemaConverter({ toJsonSchema }).convert(z.string(), 'input')).toEqual({
        type: 'string',
      })
      expect(toJsonSchema).not.toHaveBeenCalled()
    })

    it('falls back to toJsonSchema when the extension throws', () => {
      const throwing = {
        '~standard': {
          ...schema['~standard'],
          jsonSchema: {
            input: () => {
              throw new Error('unsupported target')
            },
            output: () => {
              throw new Error('unsupported target')
            },
          },
        },
      }
      const converter = new SchemaConverter({ toJsonSchema: () => ({ type: 'integer' }) })
      expect(converter.convert(throwing, 'input')).toEqual({ type: 'integer' })
    })

    it('normalises what toJsonSchema returns ($schema, $defs)', () => {
      const converter = new SchemaConverter({
        toJsonSchema: () => ({
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'array',
          items: { $ref: '#/$defs/Item' },
          $defs: { Item: { type: 'string' } },
        }),
      })
      expect(converter.convert(schema, 'output')).toEqual({
        type: 'array',
        items: { $ref: '#/components/schemas/Item' },
      })
      expect(converter.components).toEqual({ Item: { type: 'string' } })
    })

    it('makes a recursive schema a component', () => {
      const converter = new SchemaConverter({
        toJsonSchema: () => ({
          title: 'Tree',
          type: 'object',
          properties: { children: { type: 'array', items: { $ref: '#' } } },
        }),
      })
      expect(converter.convert(schema, 'output')).toEqual({ $ref: '#/components/schemas/Tree' })
      expect(converter.components.Tree).toMatchObject({
        properties: { children: { items: { $ref: '#/components/schemas/Tree' } } },
      })
    })
  })
})

describe('describeMultipartFields', () => {
  it('describes z.instanceof(File) upload fields as binary strings', () => {
    const schema = new SchemaConverter().convert(
      z.object({
        file: z.instanceof(File),
        files: z.array(z.instanceof(File)),
        blob: z.instanceof(Blob).meta({ description: 'Raw data' }),
        title: z.string(),
        tags: z.array(z.string()),
      }),
      'input',
    )

    expect(describeMultipartFields(schema.properties as never)).toEqual({
      file: { type: 'string', format: 'binary' },
      files: { type: 'array', items: { type: 'string', format: 'binary' } },
      blob: { type: 'string', format: 'binary', description: 'Raw data' },
      title: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' } },
    })
  })

  it('recognises a binary string schema', () => {
    expect(isBinarySchema({ type: 'string', format: 'binary' })).toBe(true)
    expect(isBinarySchema({ type: 'string' })).toBe(false)
  })
})

describe('path helpers', () => {
  it('converts $param to {param}', () => {
    expect(toOpenApiPath('/users/$userId')).toBe('/users/{userId}')
  })

  it('converts several params', () => {
    expect(toOpenApiPath('/users/$userId/posts/$postId')).toBe('/users/{userId}/posts/{postId}')
  })

  it('converts a rest param to {param}, without its star', () => {
    expect(toOpenApiPath('/files/$path*')).toBe('/files/{path}')
  })

  it('leaves a path without params alone', () => {
    expect(toOpenApiPath('/users')).toBe('/users')
  })

  it('handles a param at the end and the root path', () => {
    expect(toOpenApiPath('/items/$id')).toBe('/items/{id}')
    expect(toOpenApiPath('')).toBe('/')
  })
})
