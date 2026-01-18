import { describe, expect, it, vi } from 'vitest'

import {
  applyCorsToResponse,
  calculateCorsHeaders,
  calculatePreflightHeaders,
  isPreflight,
} from '../utils/cors.util.mjs'

describe('CORS Utilities', () => {
  describe('isPreflight', () => {
    it('should return true for preflight request', () => {
      expect(isPreflight('OPTIONS', 'http://example.com', 'POST')).toBe(true)
    })

    it('should return false for non-OPTIONS request', () => {
      expect(isPreflight('GET', 'http://example.com', 'POST')).toBe(false)
      expect(isPreflight('POST', 'http://example.com', 'POST')).toBe(false)
    })

    it('should return false when origin is null', () => {
      expect(isPreflight('OPTIONS', null, 'POST')).toBe(false)
    })

    it('should return false when access-control-request-method is null', () => {
      expect(isPreflight('OPTIONS', 'http://example.com', null)).toBe(false)
    })

    it('should return false when all conditions are not met', () => {
      expect(isPreflight('GET', null, null)).toBe(false)
    })
  })

  describe('calculateCorsHeaders', () => {
    it('should return null when no requestOrigin', async () => {
      const result = await calculateCorsHeaders(undefined, { origin: true })
      expect(result).toBeNull()
    })

    it('should return requestOrigin when origin is true', async () => {
      const result = await calculateCorsHeaders('http://example.com', { origin: true })
      expect(result).toEqual({
        'Access-Control-Allow-Origin': 'http://example.com',
        Vary: 'Origin',
      })
    })

    it('should return null when origin is false', async () => {
      const result = await calculateCorsHeaders('http://example.com', { origin: false })
      expect(result).toBeNull()
    })

    it('should return wildcard when origin is "*"', async () => {
      const result = await calculateCorsHeaders('http://example.com', { origin: '*' })
      expect(result).toEqual({
        'Access-Control-Allow-Origin': '*',
      })
    })

    it('should match exact string origin', async () => {
      const result = await calculateCorsHeaders('http://example.com', {
        origin: 'http://example.com',
      })
      expect(result).toEqual({
        'Access-Control-Allow-Origin': 'http://example.com',
        Vary: 'Origin',
      })
    })

    it('should return null for non-matching string origin', async () => {
      const result = await calculateCorsHeaders('http://other.com', {
        origin: 'http://example.com',
      })
      expect(result).toBeNull()
    })

    it('should match RegExp origin', async () => {
      const result = await calculateCorsHeaders('http://example.com', {
        origin: /example\.com$/,
      })
      expect(result).toEqual({
        'Access-Control-Allow-Origin': 'http://example.com',
        Vary: 'Origin',
      })
    })

    it('should return null for non-matching RegExp origin', async () => {
      const result = await calculateCorsHeaders('http://other.com', {
        origin: /example\.com$/,
      })
      expect(result).toBeNull()
    })

    it('should match origin in array', async () => {
      const result = await calculateCorsHeaders('http://example.com', {
        origin: ['http://other.com', 'http://example.com'],
      })
      expect(result).toEqual({
        'Access-Control-Allow-Origin': 'http://example.com',
        Vary: 'Origin',
      })
    })

    it('should return null when origin not in array', async () => {
      const result = await calculateCorsHeaders('http://notfound.com', {
        origin: ['http://other.com', 'http://example.com'],
      })
      expect(result).toBeNull()
    })

    it('should match RegExp in array', async () => {
      const result = await calculateCorsHeaders('http://sub.example.com', {
        origin: [/\.example\.com$/],
      })
      expect(result).toEqual({
        'Access-Control-Allow-Origin': 'http://sub.example.com',
        Vary: 'Origin',
      })
    })

    it('should use function origin with callback returning true', async () => {
      const originFn = vi.fn((origin, callback) => {
        callback(null, true)
      })
      const result = await calculateCorsHeaders('http://example.com', {
        origin: originFn,
      })
      expect(result).toEqual({
        'Access-Control-Allow-Origin': 'http://example.com',
        Vary: 'Origin',
      })
      expect(originFn).toHaveBeenCalledWith('http://example.com', expect.any(Function))
    })

    it('should use function origin with callback returning string', async () => {
      const originFn = vi.fn((origin, callback) => {
        callback(null, 'http://custom.com')
      })
      const result = await calculateCorsHeaders('http://example.com', {
        origin: originFn,
      })
      expect(result).toEqual({
        'Access-Control-Allow-Origin': 'http://custom.com',
        Vary: 'Origin',
      })
    })

    it('should return null when function origin callback has error', async () => {
      const originFn = vi.fn((origin, callback) => {
        callback(new Error('Not allowed'))
      })
      const result = await calculateCorsHeaders('http://example.com', {
        origin: originFn,
      })
      expect(result).toBeNull()
    })

    it('should return null when function origin callback returns false', async () => {
      const originFn = vi.fn((origin, callback) => {
        callback(null, false)
      })
      const result = await calculateCorsHeaders('http://example.com', {
        origin: originFn,
      })
      expect(result).toBeNull()
    })

    it('should include credentials header when credentials is true', async () => {
      const result = await calculateCorsHeaders('http://example.com', {
        origin: true,
        credentials: true,
      })
      expect(result).toEqual({
        'Access-Control-Allow-Origin': 'http://example.com',
        'Access-Control-Allow-Credentials': 'true',
        Vary: 'Origin',
      })
    })

    it('should include exposed headers', async () => {
      const result = await calculateCorsHeaders('http://example.com', {
        origin: true,
        exposedHeaders: ['X-Custom-Header', 'X-Another-Header'],
      })
      expect(result).toEqual({
        'Access-Control-Allow-Origin': 'http://example.com',
        'Access-Control-Expose-Headers': 'X-Custom-Header, X-Another-Header',
        Vary: 'Origin',
      })
    })

    it('should include exposed headers as string', async () => {
      const result = await calculateCorsHeaders('http://example.com', {
        origin: true,
        exposedHeaders: 'X-Custom-Header',
      })
      expect(result).toEqual({
        'Access-Control-Allow-Origin': 'http://example.com',
        'Access-Control-Expose-Headers': 'X-Custom-Header',
        Vary: 'Origin',
      })
    })

    it('should throw when using wildcard with credentials', async () => {
      await expect(
        calculateCorsHeaders('http://example.com', {
          origin: '*',
          credentials: true,
        }),
      ).rejects.toThrow('Cannot use wildcard origin')
    })
  })

  describe('calculatePreflightHeaders', () => {
    it('should include base CORS headers', async () => {
      const result = await calculatePreflightHeaders('http://example.com', 'POST', null, {
        origin: true,
      })
      expect(result).toMatchObject({
        'Access-Control-Allow-Origin': 'http://example.com',
      })
    })

    it('should return null when origin not allowed', async () => {
      const result = await calculatePreflightHeaders('http://example.com', 'POST', null, {
        origin: false,
      })
      expect(result).toBeNull()
    })

    it('should include default allowed methods', async () => {
      const result = await calculatePreflightHeaders('http://example.com', 'POST', null, {
        origin: true,
      })
      expect(result!['Access-Control-Allow-Methods']).toBe('GET,HEAD,PUT,PATCH,POST,DELETE')
    })

    it('should include custom methods', async () => {
      const result = await calculatePreflightHeaders('http://example.com', 'POST', null, {
        origin: true,
        methods: ['GET', 'POST'],
      })
      expect(result!['Access-Control-Allow-Methods']).toBe('GET, POST')
    })

    it('should include custom methods as string', async () => {
      const result = await calculatePreflightHeaders('http://example.com', 'POST', null, {
        origin: true,
        methods: 'GET,POST',
      })
      expect(result!['Access-Control-Allow-Methods']).toBe('GET,POST')
    })

    it('should include allowed headers', async () => {
      const result = await calculatePreflightHeaders('http://example.com', 'POST', null, {
        origin: true,
        allowedHeaders: ['Content-Type', 'Authorization'],
      })
      expect(result!['Access-Control-Allow-Headers']).toBe('Content-Type, Authorization')
    })

    it('should reflect request headers when allowedHeaders not specified', async () => {
      const result = await calculatePreflightHeaders(
        'http://example.com',
        'POST',
        'Content-Type, X-Custom',
        { origin: true },
      )
      expect(result!['Access-Control-Allow-Headers']).toBe('Content-Type, X-Custom')
      expect(result!.Vary).toContain('Access-Control-Request-Headers')
    })

    it('should include max age', async () => {
      const result = await calculatePreflightHeaders('http://example.com', 'POST', null, {
        origin: true,
        maxAge: 3600,
      })
      expect(result!['Access-Control-Max-Age']).toBe('3600')
    })

    it('should include cache control as number', async () => {
      const result = await calculatePreflightHeaders('http://example.com', 'POST', null, {
        origin: true,
        cacheControl: 600,
      })
      expect(result!['Cache-Control']).toBe('max-age=600')
    })

    it('should include cache control as string', async () => {
      const result = await calculatePreflightHeaders('http://example.com', 'POST', null, {
        origin: true,
        cacheControl: 'private, max-age=300',
      })
      expect(result!['Cache-Control']).toBe('private, max-age=300')
    })
  })

  describe('applyCorsToResponse', () => {
    it('should return original response when options is null', async () => {
      const response = new Response('test', { status: 200 })
      const result = await applyCorsToResponse(response, 'http://example.com', null)
      expect(result).toBe(response)
    })

    it('should return original response when origin not allowed', async () => {
      const response = new Response('test', { status: 200 })
      const result = await applyCorsToResponse(response, 'http://example.com', {
        origin: false,
      })
      expect(result).toBe(response)
    })

    it('should add CORS headers to response', async () => {
      const response = new Response('test', { status: 200 })
      const result = await applyCorsToResponse(response, 'http://example.com', {
        origin: true,
      })
      expect(result.headers.get('Access-Control-Allow-Origin')).toBe('http://example.com')
      expect(result.headers.get('Vary')).toBe('Origin')
    })

    it('should preserve original response properties', async () => {
      const response = new Response('test body', {
        status: 201,
        statusText: 'Created',
        headers: { 'X-Custom': 'value' },
      })
      const result = await applyCorsToResponse(response, 'http://example.com', {
        origin: true,
      })
      expect(result.status).toBe(201)
      expect(result.statusText).toBe('Created')
      expect(result.headers.get('X-Custom')).toBe('value')
      expect(await result.text()).toBe('test body')
    })

    it('should add credentials header when enabled', async () => {
      const response = new Response('test', { status: 200 })
      const result = await applyCorsToResponse(response, 'http://example.com', {
        origin: true,
        credentials: true,
      })
      expect(result.headers.get('Access-Control-Allow-Credentials')).toBe('true')
    })

    it('should handle null origin', async () => {
      const response = new Response('test', { status: 200 })
      const result = await applyCorsToResponse(response, null, { origin: true })
      // Should return original response since origin is null
      expect(result).toBe(response)
    })
  })
})
