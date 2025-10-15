import { Container } from '@navios/di'

import { beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'

import { CliParserService } from '../cli-parser.service.mjs'

describe('CliParserService', () => {
  let parser: CliParserService
  beforeEach(async () => {
    const container = new Container()
    parser = await container.get(CliParserService)
  })

  describe('basic parsing', () => {
    it('should parse simple command', () => {
      const result = parser.parse(['node', 'script.js', 'test'])
      expect(result.command).toBe('test')
      expect(result.options).toEqual({})
      expect(result.positionals).toEqual([])
    })

    it('should parse multi-word command', () => {
      const result = parser.parse(['node', 'script.js', 'db', 'migrate'])
      expect(result.command).toBe('db migrate')
      expect(result.options).toEqual({})
      expect(result.positionals).toEqual([])
    })

    it('should parse command with long options', () => {
      const result = parser.parse(['node', 'script.js', 'test', '--verbose'])
      expect(result.command).toBe('test')
      expect(result.options).toEqual({ verbose: true })
    })

    it('should parse command with long options and values', () => {
      const result = parser.parse([
        'node',
        'script.js',
        'test',
        '--config',
        'prod',
      ])
      expect(result.command).toBe('test')
      expect(result.options).toEqual({ config: 'prod' })
    })

    it('should parse command with kebab-case options to camelCase', () => {
      const result = parser.parse(['node', 'script.js', 'test', '--dry-run'])
      expect(result.command).toBe('test')
      expect(result.options).toEqual({ dryRun: true })
    })

    it('should parse command with short options', () => {
      const result = parser.parse(['node', 'script.js', 'test', '-v'])
      expect(result.command).toBe('test')
      expect(result.options).toEqual({ v: true })
    })

    it('should parse command with short options and values', () => {
      const result = parser.parse(['node', 'script.js', 'test', '-c', 'prod'])
      expect(result.command).toBe('test')
      expect(result.options).toEqual({ c: 'prod' })
    })

    it('should parse multiple short flags', () => {
      const result = parser.parse(['node', 'script.js', 'test', '-abc'])
      expect(result.command).toBe('test')
      expect(result.options).toEqual({ a: true, b: true, c: true })
    })

    it('should parse mixed options and positionals', () => {
      const result = parser.parse(
        [
          'node',
          'script.js',
          'test',
          '--verbose',
          'file1',
          '-c',
          'prod',
          'file2',
        ],
        z.object({
          verbose: z.boolean(),
          c: z.string(),
        }),
      )
      expect(result.command).toBe('test')
      expect(result.options).toEqual({ verbose: true, c: 'prod' })
      expect(result.positionals).toEqual(['file1', 'file2'])
    })

    it('should parse options with equal sign syntax', () => {
      const result = parser.parse([
        'node',
        'script.js',
        'test',
        '--config=prod',
        '--port=3000',
      ])
      expect(result.command).toBe('test')
      expect(result.options).toEqual({ config: 'prod', port: 3000 })
    })

    it('should throw error when no command provided', () => {
      expect(() => parser.parse(['node', 'script.js'])).toThrow(
        '[Navios Commander] No command provided',
      )
    })
  })

  describe('value type parsing', () => {
    it('should parse boolean values', () => {
      const result = parser.parse([
        'node',
        'script.js',
        'test',
        '--flag',
        'true',
        '--other',
        'false',
      ])
      expect(result.options).toEqual({ flag: true, other: false })
    })

    it('should parse integer values', () => {
      const result = parser.parse([
        'node',
        'script.js',
        'test',
        '--port',
        '3000',
      ])
      expect(result.options).toEqual({ port: 3000 })
    })

    it('should parse negative integer values', () => {
      const result = parser.parse([
        'node',
        'script.js',
        'test',
        '--offset',
        '"-10"',
      ])
      expect(result.options).toEqual({ offset: '"-10"' })
    })

    it('should parse float values', () => {
      const result = parser.parse([
        'node',
        'script.js',
        'test',
        '--ratio',
        '3.14',
      ])
      expect(result.options).toEqual({ ratio: 3.14 })
    })

    it('should parse null value', () => {
      const result = parser.parse([
        'node',
        'script.js',
        'test',
        '--value',
        'null',
      ])
      expect(result.options).toEqual({ value: null })
    })

    it('should parse JSON object', () => {
      const result = parser.parse([
        'node',
        'script.js',
        'test',
        '--data',
        '{"key":"value"}',
      ])
      expect(result.options).toEqual({ data: { key: 'value' } })
    })

    it('should parse JSON array', () => {
      const result = parser.parse([
        'node',
        'script.js',
        'test',
        '--items',
        '[1,2,3]',
      ])
      expect(result.options).toEqual({ items: [1, 2, 3] })
    })
  })

  describe('schema-aware parsing', () => {
    it('should detect boolean flags from schema', () => {
      const schema = z.object({
        verbose: z.boolean(),
        config: z.string(),
      })

      const result = parser.parse(
        ['node', 'script.js', 'test', '--verbose', '--config', 'prod'],
        schema,
      )

      expect(result.options).toEqual({
        verbose: true,
        config: 'prod',
      })
    })

    it('should handle optional boolean flags', () => {
      const schema = z.object({
        verbose: z.boolean().optional(),
        dryRun: z.boolean().optional(),
        config: z.string(),
      })

      const result = parser.parse(
        [
          'node',
          'script.js',
          'test',
          '--verbose',
          '--dry-run',
          '--config',
          'prod',
        ],
        schema,
      )

      expect(result.options).toEqual({
        verbose: true,
        dryRun: true,
        config: 'prod',
      })
    })

    it('should handle default boolean flags', () => {
      const schema = z.object({
        verbose: z.boolean().default(false),
        config: z.string(),
      })

      const result = parser.parse(
        ['node', 'script.js', 'test', '--verbose', '--config', 'prod'],
        schema,
      )

      expect(result.options).toEqual({
        verbose: true,
        config: 'prod',
      })
    })

    it('should prevent boolean flag from consuming next option as value', () => {
      const schema = z.object({
        verbose: z.boolean(),
        debug: z.boolean(),
        config: z.string(),
      })

      // Without schema, --verbose would incorrectly consume '--debug' as its value
      const result = parser.parse(
        [
          'node',
          'script.js',
          'test',
          '--verbose',
          '--debug',
          '--config',
          'prod',
        ],
        schema,
      )

      expect(result.options).toEqual({
        verbose: true,
        debug: true,
        config: 'prod',
      })
    })

    it('should handle mixed boolean and non-boolean options', () => {
      const schema = z.object({
        verbose: z.boolean(),
        port: z.number(),
        host: z.string(),
        dryRun: z.boolean(),
      })

      const result = parser.parse(
        [
          'node',
          'script.js',
          'test',
          '--verbose',
          '--port',
          '3000',
          '--host',
          'localhost',
          '--dry-run',
        ],
        schema,
      )

      expect(result.options).toEqual({
        verbose: true,
        port: 3000,
        host: 'localhost',
        dryRun: true,
      })
    })

    it('should work without schema (fallback behavior)', () => {
      const result = parser.parse([
        'node',
        'script.js',
        'test',
        '--verbose',
        '--config',
        'prod',
      ])

      // Without schema, parser uses heuristics
      expect(result.options).toEqual({
        verbose: true,
        config: 'prod',
      })
    })

    it('should handle short boolean flags from schema', () => {
      const schema = z.object({
        v: z.boolean(),
        c: z.string(),
      })

      const result = parser.parse(
        ['node', 'script.js', 'test', '-v', '-c', 'prod'],
        schema,
      )

      expect(result.options).toEqual({
        v: true,
        c: 'prod',
      })
    })

    it('should handle complex schema with nested optional booleans', () => {
      const schema = z.object({
        verbose: z.boolean().optional(),
        debug: z.boolean().default(false),
        quiet: z.boolean(),
        config: z.string(),
        port: z.number().optional(),
      })

      const result = parser.parse(
        [
          'node',
          'script.js',
          'test',
          '--verbose',
          '--debug',
          '--quiet',
          '--config',
          'production',
        ],
        schema,
      )

      expect(result.options).toEqual({
        verbose: true,
        debug: true,
        quiet: true,
        config: 'production',
      })
    })
  })

  describe('edge cases', () => {
    it('should handle command followed immediately by options', () => {
      const result = parser.parse(['node', 'script.js', 'test', '--flag'])
      expect(result.command).toBe('test')
      expect(result.options).toEqual({ flag: true })
    })

    it('should handle options with dashes in values', () => {
      const result = parser.parse([
        'node',
        'script.js',
        'test',
        '--branch',
        'feature-test',
      ])
      expect(result.options).toEqual({ branch: 'feature-test' })
    })

    it('should handle single dash as positional', () => {
      const result = parser.parse(['node', 'script.js', 'test', '-'])
      expect(result.positionals).toEqual(['-'])
    })
  })

  describe('array option parsing', () => {
    it('should accumulate multiple values for array options', () => {
      const schema = z.object({
        tags: z.array(z.string()),
      })

      const result = parser.parse(
        [
          'node',
          'script.js',
          'test',
          '--tags',
          'foo',
          '--tags',
          'bar',
          '--tags',
          'baz',
        ],
        schema,
      )

      expect(result.options).toEqual({
        tags: ['foo', 'bar', 'baz'],
      })
    })

    it('should handle array options with equal sign syntax', () => {
      const schema = z.object({
        tags: z.array(z.string()),
      })

      const result = parser.parse(
        [
          'node',
          'script.js',
          'test',
          '--tags=foo',
          '--tags=bar',
          '--tags=baz',
        ],
        schema,
      )

      expect(result.options).toEqual({
        tags: ['foo', 'bar', 'baz'],
      })
    })

    it('should handle array options with kebab-case', () => {
      const schema = z.object({
        excludePaths: z.array(z.string()),
      })

      const result = parser.parse(
        [
          'node',
          'script.js',
          'test',
          '--exclude-paths',
          'node_modules',
          '--exclude-paths',
          'dist',
        ],
        schema,
      )

      expect(result.options).toEqual({
        excludePaths: ['node_modules', 'dist'],
      })
    })

    it('should handle optional array options', () => {
      const schema = z.object({
        tags: z.array(z.string()).optional(),
        verbose: z.boolean(),
      })

      const result = parser.parse(
        [
          'node',
          'script.js',
          'test',
          '--tags',
          'foo',
          '--tags',
          'bar',
          '--verbose',
        ],
        schema,
      )

      expect(result.options).toEqual({
        tags: ['foo', 'bar'],
        verbose: true,
      })
    })

    it('should handle array options with default values', () => {
      const schema = z.object({
        tags: z.array(z.string()).default([]),
      })

      const result = parser.parse(
        ['node', 'script.js', 'test', '--tags', 'foo', '--tags', 'bar'],
        schema,
      )

      expect(result.options).toEqual({
        tags: ['foo', 'bar'],
      })
    })

    it('should handle mixed array, boolean, and string options', () => {
      const schema = z.object({
        tags: z.array(z.string()),
        verbose: z.boolean(),
        config: z.string(),
        ports: z.array(z.number()),
      })

      const result = parser.parse(
        [
          'node',
          'script.js',
          'test',
          '--tags',
          'foo',
          '--verbose',
          '--config',
          'prod',
          '--tags',
          'bar',
          '--ports',
          '3000',
          '--ports',
          '4000',
        ],
        schema,
      )

      expect(result.options).toEqual({
        tags: ['foo', 'bar'],
        verbose: true,
        config: 'prod',
        ports: [3000, 4000],
      })
    })

    it('should handle short array options', () => {
      const schema = z.object({
        t: z.array(z.string()),
      })

      const result = parser.parse(
        ['node', 'script.js', 'test', '-t', 'foo', '-t', 'bar'],
        schema,
      )

      expect(result.options).toEqual({
        t: ['foo', 'bar'],
      })
    })

    it('should parse array option values with correct types', () => {
      const schema = z.object({
        ports: z.array(z.number()),
        flags: z.array(z.boolean()),
      })

      const result = parser.parse(
        [
          'node',
          'script.js',
          'test',
          '--ports',
          '3000',
          '--ports',
          '4000',
          '--flags',
          'true',
          '--flags',
          'false',
        ],
        schema,
      )

      expect(result.options).toEqual({
        ports: [3000, 4000],
        flags: [true, false],
      })
    })

    it('should handle JSON array values for array options', () => {
      const schema = z.object({
        items: z.array(z.any()),
      })

      const result = parser.parse(
        ['node', 'script.js', 'test', '--items', '[1,2,3]', '--items', '["a","b"]'],
        schema,
      )

      expect(result.options).toEqual({
        items: [[1, 2, 3], ['a', 'b']],
      })
    })

    it('should handle array options with positionals', () => {
      const schema = z.object({
        tags: z.array(z.string()),
      })

      const result = parser.parse(
        [
          'node',
          'script.js',
          'test',
          '--tags',
          'foo',
          'file1.txt',
          '--tags',
          'bar',
          'file2.txt',
        ],
        schema,
      )

      expect(result.options).toEqual({
        tags: ['foo', 'bar'],
      })
      expect(result.positionals).toEqual(['file1.txt', 'file2.txt'])
    })

    it('should not treat non-array options as arrays without schema', () => {
      // Without schema, multiple values should overwrite
      const result = parser.parse([
        'node',
        'script.js',
        'test',
        '--tag',
        'foo',
        '--tag',
        'bar',
      ])

      expect(result.options).toEqual({
        tag: 'bar', // Last value wins without schema
      })
    })
  })
})
