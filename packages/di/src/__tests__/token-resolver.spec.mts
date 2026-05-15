import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import { Injectable } from '../decorators/index.mjs'
import { DIError, DIErrorCode } from '../errors/index.mjs'
import { TokenResolver } from '../internal/core/token-resolver.mjs'
import {
  BoundToken,
  FactoryToken,
  Token,
} from '../token/token.mjs'
import { getInjectableToken } from '../utils/index.mjs'

describe('TokenResolver', () => {
  let resolver: TokenResolver

  beforeEach(() => {
    resolver = new TokenResolver()
  })

  describe('normalizeToken', () => {
    it('should return Token as-is', () => {
      const token = Token.create<string>('test')
      const result = resolver.normalizeToken(token)
      expect(result).toBe(token)
    })

    it('should return BoundToken as-is', () => {
      const schema = z.object({ value: z.string() })
      const token = Token.create<string, typeof schema>('test', schema)
      const bound = new BoundToken(token, { value: 'test' })
      const result = resolver.normalizeToken(bound)
      expect(result).toBe(bound)
    })

    it('should return FactoryToken as-is', () => {
      const schema = z.object({ value: z.string() })
      const token = Token.create<string, typeof schema>('test', schema)
      const factory = new FactoryToken(token, async () => ({
        value: 'test',
      }))
      const result = resolver.normalizeToken(factory)
      expect(result).toBe(factory)
    })

    it('should extract token from decorated class', () => {
      @Injectable()
      class TestService {}

      const result = resolver.normalizeToken(TestService)
      expect(result).toBeInstanceOf(Token)
      expect(result).toBe(getInjectableToken(TestService))
    })
  })

  describe('getRealToken', () => {
    it('should return Token as-is', () => {
      const token = Token.create<string>('test')
      const result = resolver.getRealToken(token)
      expect(result).toBe(token)
    })

    it('should unwrap BoundToken', () => {
      const schema = z.object({ value: z.string() })
      const token = Token.create<string, typeof schema>('test', schema)
      const bound = new BoundToken(token, { value: 'test' })
      const result = resolver.getRealToken(bound)
      expect(result).toBe(token)
    })

    it('should unwrap FactoryToken', () => {
      const schema = z.object({ value: z.string() })
      const token = Token.create<string, typeof schema>('test', schema)
      const factory = new FactoryToken(token, async () => ({
        value: 'test',
      }))
      const result = resolver.getRealToken(factory)
      expect(result).toBe(token)
    })
  })

  describe('getRegistryToken', () => {
    it('should normalize and unwrap class to Token', () => {
      @Injectable()
      class TestService {}

      const result = resolver.getRegistryToken(TestService)
      expect(result).toBeInstanceOf(Token)
      expect(result).toBe(getInjectableToken(TestService))
    })

    it('should normalize and unwrap BoundToken to Token', () => {
      const schema = z.object({ value: z.string() })
      const token = Token.create<string, typeof schema>('test', schema)
      const bound = new BoundToken(token, { value: 'test' })

      const result = resolver.getRegistryToken(bound)
      expect(result).toBe(token)
    })
  })

  describe('validateAndResolveTokenArgs', () => {
    it('should pass through token without schema', () => {
      const token = Token.create<string>('test')
      const [error, data] = resolver.validateAndResolveTokenArgs(token)

      expect(error).toBeUndefined()
      expect(data.actualToken).toBe(token)
      expect(data.validatedArgs).toBeUndefined()
    })

    it('should pass through token with valid args and schema', () => {
      const schema = z.object({ value: z.string() })
      const token = Token.create<string, typeof schema>('test', schema)
      const args = { value: 'hello' }

      const [error, data] = resolver.validateAndResolveTokenArgs(token, args)

      expect(error).toBeUndefined()
      expect(data.actualToken).toBe(token)
      expect(data.validatedArgs).toEqual({ value: 'hello' })
    })

    it('should return error for invalid args', () => {
      const schema = z.object({ value: z.string() })
      const token = Token.create<string, typeof schema>('test', schema)
      const args = { value: 123 } // Invalid: should be string

      const [error] = resolver.validateAndResolveTokenArgs(token, args)

      expect(error).toBeInstanceOf(DIError)
      expect(error?.code).toBe(DIErrorCode.TokenValidationError)
    })

    it('should extract args from BoundToken', () => {
      const schema = z.object({ value: z.string() })
      const token = Token.create<string, typeof schema>('test', schema)
      const bound = new BoundToken(token, { value: 'bound-value' })

      const [error, data] = resolver.validateAndResolveTokenArgs(bound)

      expect(error).toBeUndefined()
      expect(data.actualToken).toBe(bound)
      expect(data.validatedArgs).toEqual({ value: 'bound-value' })
    })

    it('should return error for unresolved FactoryToken', () => {
      const schema = z.object({ value: z.string() })
      const token = Token.create<string, typeof schema>('test', schema)
      const factory = new FactoryToken(token, async () => ({
        value: 'test',
      }))

      const [error] = resolver.validateAndResolveTokenArgs(factory)

      expect(error).toBeInstanceOf(DIError)
      expect(error?.code).toBe(DIErrorCode.FactoryTokenNotResolved)
    })

    it('should extract args from resolved FactoryToken', async () => {
      const schema = z.object({ value: z.string() })
      const token = Token.create<string, typeof schema>('test', schema)
      const factory = new FactoryToken(token, async () => ({
        value: 'factory-value',
      }))

      // Resolve the factory first
      await factory.resolve({
        inject: vi.fn(),
        container: {} as any,
        addDestroyListener: vi.fn(),
      })

      const [error, data] = resolver.validateAndResolveTokenArgs(factory)

      expect(error).toBeUndefined()
      expect(data.actualToken).toBe(factory)
      expect(data.validatedArgs).toEqual({ value: 'factory-value' })
    })

    it('should handle class constructor token', () => {
      @Injectable()
      class TestService {}

      const [error, data] = resolver.validateAndResolveTokenArgs(TestService)

      expect(error).toBeUndefined()
      expect(data.actualToken).toBeInstanceOf(Token)
    })

    it('should log validation errors when logger is provided', () => {
      const mockLogger = {
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as unknown as Console

      const resolverWithLogger = new TokenResolver(mockLogger)
      const schema = z.object({ value: z.string() })
      const token = Token.create<string, typeof schema>('test', schema)

      resolverWithLogger.validateAndResolveTokenArgs(token, { value: 123 })

      expect(mockLogger.error).toHaveBeenCalled()
    })
  })
})
