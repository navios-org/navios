import { Container } from '@navios/di'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod/v4'

import { FastifyValidatorCompilerService } from '../services/fastify-validator-compiler.service.mjs'

describe('FastifyValidatorCompilerService', () => {
  let container: Container

  beforeEach(() => {
    container = new Container()
  })

  afterEach(async () => {
    await container.dispose()
  })

  describe('errorCompiler', () => {
    it('should return value for valid data', async () => {
      const service = await container.get(FastifyValidatorCompilerService)
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      })

      // @ts-expect-error - Mocking the service
      const validator = service.errorCompiler({ schema })
      const result = validator({ name: 'John', age: 30 })

      expect(result).toEqual({ value: { name: 'John', age: 30 } })
    })

    it('should return error for invalid data', async () => {
      const service = await container.get(FastifyValidatorCompilerService)
      const schema = z.object({
        name: z.string(),
        age: z.number(),
      })

      // @ts-expect-error - Mocking the service
      const validator = service.errorCompiler({ schema })
      const result = validator({ name: 'John', age: 'not-a-number' })

      expect(result).toHaveProperty('error')
      // @ts-expect-error - Mocking the service
      expect(result.error).toBeDefined()
    })

    it('should return error for missing required fields', async () => {
      const service = await container.get(FastifyValidatorCompilerService)
      const schema = z.object({
        name: z.string(),
        email: z.string().email(),
      })

      // @ts-expect-error - Mocking the service
      const validator = service.errorCompiler({ schema })
      const result = validator({ name: 'John' })

      expect(result).toHaveProperty('error')
    })

    it('should validate optional fields correctly', async () => {
      const service = await container.get(FastifyValidatorCompilerService)
      const schema = z.object({
        name: z.string(),
        nickname: z.string().optional(),
      })

      // @ts-expect-error - Mocking the service
      const validator = service.errorCompiler({ schema })
      const result = validator({ name: 'John' })

      expect(result).toEqual({ value: { name: 'John' } })
    })

    it('should validate nested objects', async () => {
      const service = await container.get(FastifyValidatorCompilerService)
      const schema = z.object({
        user: z.object({
          name: z.string(),
          address: z.object({
            city: z.string(),
          }),
        }),
      })

      // @ts-expect-error - Mocking the service
      const validator = service.errorCompiler({ schema })
      const result = validator({
        user: {
          name: 'John',
          address: {
            city: 'NYC',
          },
        },
      })

      expect(result).toEqual({
        value: {
          user: {
            name: 'John',
            address: {
              city: 'NYC',
            },
          },
        },
      })
    })

    it('should validate arrays', async () => {
      const service = await container.get(FastifyValidatorCompilerService)
      const schema = z.object({
        tags: z.array(z.string()),
      })

      // @ts-expect-error - Mocking the service
      const validator = service.errorCompiler({ schema })
      const result = validator({ tags: ['one', 'two', 'three'] })

      expect(result).toEqual({ value: { tags: ['one', 'two', 'three'] } })
    })

    it('should return error for invalid array items', async () => {
      const service = await container.get(FastifyValidatorCompilerService)
      const schema = z.object({
        numbers: z.array(z.number()),
      })

      // @ts-expect-error - Mocking the service
      const validator = service.errorCompiler({ schema })
      const result = validator({ numbers: [1, 'two', 3] })

      expect(result).toHaveProperty('error')
    })
  })
})
