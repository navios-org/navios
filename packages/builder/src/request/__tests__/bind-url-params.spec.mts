import { describe, expect, it } from 'vitest'

import { bindUrlParams } from '../index.mjs'

describe('bindUrlParams', () => {
  describe('basic replacements', () => {
    it('should replace url params', () => {
      const url = bindUrlParams('/users/$id', {
        urlParams: { id: 1 },
      })

      expect(url).toBe('/users/1')
    })

    it('should replace multiple url params', () => {
      const url = bindUrlParams('/users/$id/$name', {
        urlParams: { id: 1, name: 'john' },
      })

      expect(url).toBe('/users/1/john')
    })

    it('should replace multiple occurrences of the same param', () => {
      const url = bindUrlParams('/users/$id/$id', {
        urlParams: { id: 1 },
      })

      expect(url).toBe('/users/1/1')
    })

    it('should handle string values', () => {
      const url = bindUrlParams('/users/$userId', {
        urlParams: { userId: 'abc-123' },
      })

      expect(url).toBe('/users/abc-123')
    })

    it('should handle numeric values', () => {
      const url = bindUrlParams('/users/$userId', {
        urlParams: { userId: 42 },
      })

      expect(url).toBe('/users/42')
    })

    it('should handle three URL params', () => {
      const url = bindUrlParams(
        '/users/$userId/posts/$postId/comments/$commentId',
        {
          urlParams: { userId: '1', postId: '2', commentId: '3' },
        },
      )

      expect(url).toBe('/users/1/posts/2/comments/3')
    })
  })

  describe('URLs without params', () => {
    it('should return url unchanged when no params are needed', () => {
      const url = bindUrlParams('/users', {})

      expect(url).toBe('/users')
    })

    it('should return url unchanged for complex paths without params', () => {
      const url = bindUrlParams('/api/v1/users/list', {})

      expect(url).toBe('/api/v1/users/list')
    })
  })

  describe('error handling', () => {
    it('should throw when urlParams is missing', () => {
      expect(() => bindUrlParams('/users/$id' as const, {})).toThrow(
        'Missing urlParams. Required parameters: id',
      )
    })

    it('should throw when urlParams is undefined', () => {
      expect(() =>
        bindUrlParams('/users/$id', { urlParams: undefined } as any),
      ).toThrow('Missing urlParams. Required parameters: id')
    })

    it('should throw when a required param is missing', () => {
      expect(() =>
        bindUrlParams('/users/$userId/posts/$postId', {
          urlParams: { userId: '123' } as any,
        }),
      ).toThrow('Missing required URL parameters: postId')
    })

    it('should throw listing all missing params', () => {
      expect(() =>
        bindUrlParams('/users/$userId/posts/$postId', {
          urlParams: {} as any,
        }),
      ).toThrow('Missing required URL parameters: userId, postId')
    })

    it('should throw when param value is undefined', () => {
      expect(() =>
        bindUrlParams('/users/$userId', {
          urlParams: { userId: undefined } as any,
        }),
      ).toThrow('Missing required URL parameters: userId')
    })
  })

  describe('edge cases', () => {
    it('should handle params at the end of URL', () => {
      const url = bindUrlParams('/files/$fileId', {
        urlParams: { fileId: 'doc-123' },
      })

      expect(url).toBe('/files/doc-123')
    })

    it('should handle params at the start of URL', () => {
      const url = bindUrlParams('/$version/users', {
        urlParams: { version: 'v2' },
      })

      expect(url).toBe('/v2/users')
    })

    it('should handle alphanumeric param names', () => {
      const url = bindUrlParams('/users/$userId123', {
        urlParams: { userId123: 'test' },
      })

      expect(url).toBe('/users/test')
    })

    it('should URL-encode param values with special characters', () => {
      const url = bindUrlParams('/search/$query', {
        urlParams: { query: 'hello world' },
      })

      expect(url).toBe('/search/hello%20world')
    })

    it('should handle duplicate param names', () => {
      const url = bindUrlParams('/users/$id/$id', {
        urlParams: { id: '123' },
      })

      expect(url).toBe('/users/123/123')
    })

    it('should URL-encode special URL characters', () => {
      const url = bindUrlParams('/search/$query', {
        urlParams: { query: 'foo&bar=baz?qux#hash' },
      })

      expect(url).toBe('/search/foo%26bar%3Dbaz%3Fqux%23hash')
    })

    it('should handle param values containing $ without causing replacement issues', () => {
      const url = bindUrlParams('/users/$id/$name', {
        urlParams: { id: '$name', name: 'john' },
      })

      // The $name in the id value should NOT be replaced - it should be encoded
      expect(url).toBe('/users/%24name/john')
    })

    it('should preserve other request properties', () => {
      const params = {
        urlParams: { id: '123' },
        params: { page: 1 },
        headers: { Authorization: 'Bearer token' },
      }
      const url = bindUrlParams('/users/$id', params)

      expect(url).toBe('/users/123')
      // Original params should not be modified
      expect(params.params).toEqual({ page: 1 })
      expect(params.headers).toEqual({ Authorization: 'Bearer token' })
    })
  })
})
