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
        '/users',
      )

      expect(config.method).toBe('GET')
      expect(config.url).toBe('/users')
    })

    it('should forward per-call headers and signal', () => {
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
        '/users',
      )

      expect(config.headers).toEqual({ Authorization: 'Bearer token' })
      expect(config.signal).toBeNull()
    })
  })

  describe('forwarded keys', () => {
    it('should not spread unknown request keys or urlParams into the config', () => {
      const config = makeConfig(
        { urlParams: { id: '1' }, params: { a: 1 }, data: { b: 2 }, extra: 'nope' } as any,
        { method: 'POST', url: '/users/$id', responseSchema } as any,
        '/users/1',
      )

      expect(config).toEqual({
        method: 'POST',
        url: '/users/1',
        params: { a: 1 },
        data: { b: 2 },
      })
    })

    it('should read the method from the endpoint options', () => {
      const config = makeConfig({}, { method: 'PATCH', url: '/users', responseSchema }, '/users')

      expect(config.method).toBe('PATCH')
    })

    it('should layer headers: clientOptions, then endpoint, then call', () => {
      const config = makeConfig(
        { headers: { c: 'call' } },
        {
          method: 'GET',
          url: '/users',
          responseSchema,
          headers: { b: 'endpoint', c: 'endpoint' },
          clientOptions: { headers: { a: 'client', b: 'client', c: 'client' } },
        },
        '/users',
      )

      expect(config.headers).toEqual({ a: 'client', b: 'endpoint', c: 'call' })
    })

    it('should omit signal and timeout when neither call nor endpoint sets them', () => {
      const config = makeConfig({}, { method: 'GET', url: '/users', responseSchema }, '/users')

      expect(config).not.toHaveProperty('signal')
      expect(config).not.toHaveProperty('timeout')
      expect(config).not.toHaveProperty('headers')
    })

    it.each([
      ['blob', 'blob'],
      ['text', 'text'],
      ['stream', 'stream'],
    ] as const)('should map response %s to responseType %s', (response, responseType) => {
      const config = makeConfig({}, { method: 'GET', url: '/f', response }, '/f')

      expect(config.responseType).toBe(responseType)
    })

    it('should ask for text, not JSON parsing, for response void', () => {
      const config = makeConfig({}, { method: 'GET', url: '/f', response: 'void' }, '/f')

      expect(config.responseType).toBe('text')
    })

    it('should not set responseType for response json', () => {
      const config = makeConfig({}, { method: 'GET', url: '/f', response: 'json' }, '/f')

      expect(config).not.toHaveProperty('responseType')
    })
  })

  describe('params', () => {
    it('should be the params of the call, or an empty object', () => {
      const options = { method: 'GET', url: '/users', responseSchema } as const

      expect(makeConfig({ params: { page: 1 } }, options, '/users').params).toEqual({ page: 1 })
      expect(makeConfig({}, options, '/users').params).toEqual({})
    })
  })

  describe('header names', () => {
    it('should let a later level replace a header spelled differently', () => {
      const config = makeConfig(
        { headers: { 'x-feature': 'call' } },
        {
          method: 'GET',
          url: '/users',
          responseSchema,
          headers: { 'X-Feature': 'endpoint', Accept: 'text/csv' },
          clientOptions: { headers: { ACCEPT: '*/*' } },
        },
        '/users',
      )

      expect(config.headers).toEqual({ 'x-feature': 'call', Accept: 'text/csv' })
    })

    it('should leave out undefined headers', () => {
      const config = makeConfig(
        { headers: { a: undefined as never } },
        { method: 'GET', url: '/users', responseSchema, headers: { A: '1' } },
        '/users',
      )

      expect(config.headers).toEqual({ A: '1' })
    })
  })

  describe('primitive JSON bodies', () => {
    const options = { method: 'POST', url: '/x', responseSchema } as const

    it('should encode a string', () => {
      const config = makeConfig({ data: '42' }, options, '/x')

      expect(config.data).toBe('"42"')
      expect(config.headers).toEqual({ 'content-type': 'application/json' })
    })

    it.each([0, 5, true, false, null])('should mark %j as JSON', (data) => {
      const config = makeConfig({ data }, options, '/x')

      expect(config.data).toBe(data)
      expect(config.headers).toEqual({ 'content-type': 'application/json' })
    })

    it('should encode a string under a JSON content type of the endpoint', () => {
      const headers = { 'Content-Type': 'application/vnd.api+json' }
      const config = makeConfig({ data: 'x' }, { ...options, headers }, '/x')

      expect(config.data).toBe('"x"')
      expect(config.headers).toEqual(headers)
    })

    it('should leave a string under any other content type alone', () => {
      const headers = { 'Content-Type': 'application/xml' }
      const config = makeConfig({ data: '<a/>' }, { ...options, headers }, '/x')

      expect(config.data).toBe('<a/>')
      expect(config.headers).toEqual(headers)
    })

    it.each([undefined, { a: 1 }, ['a'], new FormData(), new Blob([])])(
      'should leave %o to the client',
      (data) => {
        const config = makeConfig({ data }, options, '/x')

        expect(config.data).toBe(data)
        expect(config).not.toHaveProperty('headers')
      },
    )
  })

  describe('multipart mode', () => {
    const requestSchema = z.object({
      name: z.string(),
      file: z.instanceof(File),
    })

    it("should create FormData when the endpoint declares body: 'multipart'", () => {
      const file = new File(['content'], 'test.txt', { type: 'text/plain' })

      const config = makeConfig(
        { data: { name: 'Test', file } } as any,
        {
          method: 'POST',
          url: '/upload',
          body: 'multipart',
          requestSchema,
          responseSchema,
        } as any,
        '/upload',
      )

      expect(config.data).toBeInstanceOf(FormData)
      const formData = config.data as FormData
      expect(formData.get('name')).toBe('Test')
      expect(formData.get('file')).toBeInstanceOf(File)
    })
  })
})

describe('makeFormData', () => {
  describe('basic types', () => {
    it('should handle string values', () => {
      const formData = makeFormData({ name: 'John' })

      expect(formData.get('name')).toBe('John')
    })

    it('should handle number values', () => {
      const formData = makeFormData({ count: 42 })

      expect(formData.get('count')).toBe('42')
    })

    it('should handle boolean values', () => {
      const formData = makeFormData({ active: true, disabled: false })

      expect(formData.get('active')).toBe('true')
      expect(formData.get('disabled')).toBe('false')
    })

    it('should handle null values as empty string', () => {
      const formData = makeFormData({ value: null })

      expect(formData.get('value')).toBe('')
    })

    it('should leave undefined values out', () => {
      const formData = makeFormData({ value: undefined, list: ['a', undefined], kept: null })

      expect(formData.has('value')).toBe(false)
      expect(formData.getAll('list')).toEqual(['a'])
      expect(formData.get('kept')).toBe('')
    })

    it('should send a Blob as a binary part', async () => {
      const formData = makeFormData({
        file: new Blob(['hello']),
        files: [new Blob(['a']), new Blob(['b'])],
      })

      const part = formData.get('file') as Blob
      expect(part).toBeInstanceOf(Blob)
      expect(await part.text()).toBe('hello')
      expect(formData.getAll('files')).toHaveLength(2)
      expect(formData.getAll('files')[0]).toBeInstanceOf(Blob)
    })

    it('should send a FormData instance as it is', () => {
      const input = new FormData()
      input.append('a', '1')
      input.append('a', '2')

      const formData = makeFormData(input)

      expect(formData).toBe(input)
      expect([...formData.keys()]).toEqual(['a', 'a'])
    })

    it('should not pick up inherited properties', () => {
      const data = Object.create({ inherited: 'no' })
      data.own = 'yes'

      const formData = makeFormData(data)

      expect([...formData.keys()]).toEqual(['own'])
    })
  })

  describe('File handling', () => {
    it('should handle File objects', () => {
      const file = new File(['content'], 'test.txt', { type: 'text/plain' })

      const formData = makeFormData({ file })

      const result = formData.get('file') as File
      expect(result).toBeInstanceOf(File)
      expect(result.name).toBe('test.txt')
    })

    it('should handle multiple files in an array', () => {
      const file1 = new File(['content1'], 'file1.txt', { type: 'text/plain' })
      const file2 = new File(['content2'], 'file2.txt', { type: 'text/plain' })

      const formData = makeFormData({ files: [file1, file2] })

      const files = formData.getAll('files') as File[]
      expect(files).toHaveLength(2)
      expect(files[0].name).toBe('file1.txt')
      expect(files[1].name).toBe('file2.txt')
    })
  })

  describe('Date handling', () => {
    it('should convert Date to ISO string', () => {
      const date = new Date('2024-01-15T12:00:00.000Z')

      const formData = makeFormData({ createdAt: date })

      expect(formData.get('createdAt')).toBe('2024-01-15T12:00:00.000Z')
    })
  })

  describe('object handling', () => {
    it('should JSON stringify plain objects', () => {
      const formData = makeFormData({ metadata: { key: 'value', nested: { a: 1 } } })

      expect(formData.get('metadata')).toBe('{"key":"value","nested":{"a":1}}')
    })

    it('should use toISOString if available', () => {
      const customDate = {
        toISOString: () => '2024-custom-date',
      }

      const formData = makeFormData({ date: customDate })

      expect(formData.get('date')).toBe('2024-custom-date')
    })

    it('should use toJSON if available and no toISOString', () => {
      const customObject = {
        toJSON: () => ({ serialized: true }),
      }

      const formData = makeFormData({ obj: customObject })

      expect(formData.get('obj')).toBe('{"serialized":true}')
    })
  })

  describe('array handling', () => {
    it('should handle array of strings', () => {
      const formData = makeFormData({ tags: ['a', 'b', 'c'] })

      const tags = formData.getAll('tags')
      expect(tags).toEqual(['a', 'b', 'c'])
    })

    it('should handle array of numbers', () => {
      const formData = makeFormData({ ids: [1, 2, 3] })

      const ids = formData.getAll('ids')
      expect(ids).toEqual(['1', '2', '3'])
    })

    it('should handle mixed array with files and other types', () => {
      const file = new File(['content'], 'test.txt', { type: 'text/plain' })

      const formData = makeFormData({ items: [file, 'text', 123] })

      const items = formData.getAll('items')
      expect(items).toHaveLength(3)
      expect(items[0]).toBeInstanceOf(File)
      expect(items[1]).toBe('text')
      expect(items[2]).toBe('123')
    })
  })
})
