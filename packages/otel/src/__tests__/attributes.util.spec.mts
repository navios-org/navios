import { describe, expect, it } from 'vitest'

import {
  createHttpRequestAttributes,
  createNaviosAttributes,
  HttpAttributes,
  NaviosAttributes,
  parseUrlAttributes,
} from '../utils/attributes.util.mjs'

describe('attributes.util', () => {
  describe('createHttpRequestAttributes', () => {
    it('should create basic HTTP attributes', () => {
      const attrs = createHttpRequestAttributes({
        method: 'GET',
        url: 'https://example.com/api/users',
      })

      expect(attrs[HttpAttributes.METHOD]).toBe('GET')
      expect(attrs[HttpAttributes.URL]).toBe('https://example.com/api/users')
    })

    it('should extract user-agent from headers', () => {
      const attrs = createHttpRequestAttributes({
        method: 'POST',
        url: '/api/data',
        headers: {
          'user-agent': 'Mozilla/5.0',
        },
      })

      expect(attrs[HttpAttributes.USER_AGENT]).toBe('Mozilla/5.0')
    })

    it('should extract content-length from headers', () => {
      const attrs = createHttpRequestAttributes({
        method: 'POST',
        url: '/api/data',
        headers: {
          'content-length': '1234',
        },
      })

      expect(attrs[HttpAttributes.REQUEST_CONTENT_LENGTH]).toBe(1234)
    })

    it('should extract client IP from x-forwarded-for', () => {
      const attrs = createHttpRequestAttributes({
        method: 'GET',
        url: '/api/data',
        headers: {
          'x-forwarded-for': '192.168.1.1, 10.0.0.1',
        },
      })

      expect(attrs[HttpAttributes.CLIENT_IP]).toBe('192.168.1.1')
    })

    it('should extract client IP from x-real-ip', () => {
      const attrs = createHttpRequestAttributes({
        method: 'GET',
        url: '/api/data',
        headers: {
          'x-real-ip': '192.168.1.100',
        },
      })

      expect(attrs[HttpAttributes.CLIENT_IP]).toBe('192.168.1.100')
    })

    it('should handle array header values', () => {
      const attrs = createHttpRequestAttributes({
        method: 'GET',
        url: '/api/data',
        headers: {
          'user-agent': ['Mozilla/5.0', 'Chrome/100'],
        },
      })

      expect(attrs[HttpAttributes.USER_AGENT]).toBe('Mozilla/5.0')
    })
  })

  describe('createNaviosAttributes', () => {
    it('should create controller attribute', () => {
      const attrs = createNaviosAttributes({
        controller: 'UserController',
      })

      expect(attrs[NaviosAttributes.CONTROLLER]).toBe('UserController')
    })

    it('should create handler attribute', () => {
      const attrs = createNaviosAttributes({
        handler: 'getUser',
      })

      expect(attrs[NaviosAttributes.HANDLER]).toBe('getUser')
    })

    it('should create module attribute', () => {
      const attrs = createNaviosAttributes({
        module: 'UserModule',
      })

      expect(attrs[NaviosAttributes.MODULE]).toBe('UserModule')
    })

    it('should create guard attribute', () => {
      const attrs = createNaviosAttributes({
        guard: 'AuthGuard',
      })

      expect(attrs[NaviosAttributes.GUARD]).toBe('AuthGuard')
    })

    it('should create multiple attributes', () => {
      const attrs = createNaviosAttributes({
        controller: 'UserController',
        handler: 'getUser',
        module: 'UserModule',
      })

      expect(attrs[NaviosAttributes.CONTROLLER]).toBe('UserController')
      expect(attrs[NaviosAttributes.HANDLER]).toBe('getUser')
      expect(attrs[NaviosAttributes.MODULE]).toBe('UserModule')
    })

    it('should skip undefined values', () => {
      const attrs = createNaviosAttributes({
        controller: 'UserController',
        handler: undefined,
      })

      expect(attrs[NaviosAttributes.CONTROLLER]).toBe('UserController')
      expect(NaviosAttributes.HANDLER in attrs).toBe(false)
    })
  })

  describe('parseUrlAttributes', () => {
    it('should parse full URL', () => {
      const attrs = parseUrlAttributes('https://example.com/api/users?page=1')

      expect(attrs[HttpAttributes.SCHEME]).toBe('https')
      expect(attrs[HttpAttributes.HOST]).toBe('example.com')
      expect(attrs[HttpAttributes.TARGET]).toBe('/api/users')
    })

    it('should parse path-only URL', () => {
      const attrs = parseUrlAttributes('/api/users')

      expect(attrs[HttpAttributes.TARGET]).toBe('/api/users')
      expect(HttpAttributes.SCHEME in attrs).toBe(false)
      expect(HttpAttributes.HOST in attrs).toBe(false)
    })

    it('should strip query string from target', () => {
      const attrs = parseUrlAttributes('/api/users?page=1&limit=10')

      expect(attrs[HttpAttributes.TARGET]).toBe('/api/users')
    })

    it('should handle URL with port', () => {
      const attrs = parseUrlAttributes('http://localhost:3000/api/data')

      expect(attrs[HttpAttributes.SCHEME]).toBe('http')
      expect(attrs[HttpAttributes.HOST]).toBe('localhost:3000')
      expect(attrs[HttpAttributes.TARGET]).toBe('/api/data')
    })

    it('should handle invalid URL gracefully', () => {
      const attrs = parseUrlAttributes('not-a-valid-url')

      expect(attrs[HttpAttributes.TARGET]).toBe('not-a-valid-url')
    })
  })
})
