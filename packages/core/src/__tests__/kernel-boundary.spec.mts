import { existsSync, readFileSync } from 'node:fs'
import { isBuiltin } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const src = resolve(here, '..')

/** The names `index.mts` exported at runtime before the neutral layer was split off. */
const exportsBefore = JSON.parse(
  readFileSync(join(here, 'fixtures/index-exports.json'), 'utf8'),
) as string[]

/** Directories that hold only HTTP code. */
const HTTP_DIRS = [
  'adapter',
  'pipeline',
  'routing',
  'errors',
  'responses',
  'sse',
  'controllers',
  'handlers',
  'conformance',
  'testing',
  'context',
  'legacy-compat',
]

/** HTTP files in directories that also hold neutral code. */
const HTTP_FILES = [
  'application/navios-application.mts',
  'application/navios-application-options.mts',
  'application/navios-factory.mts',
  'application/assemble-routes.mts',
  'application/http-transport.mts',
  'application/http-module-options.mts',
  'application/module-prefixes.mts',
  'application/index.mts',
  'index.mts',
]

function isHttp(file: string): boolean {
  return HTTP_FILES.includes(file) || HTTP_DIRS.some((dir) => file.startsWith(`${dir}/`))
}

const specifier = /(?:\bfrom\s+|\bimport\s+|\bimport\()\s*['"]([^'"]+)['"]/g

/**
 * Every source file reachable from an entry through imports and re-exports,
 * type-only ones included, and every package it imports from.
 */
function reach(entry: string): { files: string[]; packages: string[] } {
  const files = new Set<string>()
  const packages = new Set<string>()
  const visit = (file: string) => {
    if (files.has(file)) {
      return
    }
    files.add(file)
    const text = readFileSync(join(src, file), 'utf8')
    for (const match of text.matchAll(specifier)) {
      const target = match[1]
      if (!target.startsWith('.')) {
        packages.add(target)
        continue
      }
      const absolute = resolve(join(src, dirname(file)), target.replace(/\.mjs$/, '.mts'))
      if (existsSync(absolute)) {
        visit(relative(src, absolute))
      }
    }
  }
  visit(entry)
  return { files: [...files].sort(), packages: [...packages].sort() }
}

describe('the neutral layer', () => {
  it.each(['kernel.mts', 'transport.mts'])('%s reaches no HTTP file', (entry) => {
    const { files, packages } = reach(entry)

    expect(files.length).toBeGreaterThan(5)
    expect(files.filter(isHttp)).toEqual([])
    expect(packages.filter((name) => !isBuiltin(name))).toEqual(['@navios/di'])
  })

  it('finds HTTP files from the main entry, so the walk is real', () => {
    expect(reach('index.mts').files.filter(isHttp).length).toBeGreaterThan(20)
  })
})

describe('the main entry', () => {
  it('exports everything it exported before the split', async () => {
    const after = Object.keys(await import('../index.mjs'))

    expect(exportsBefore.filter((name) => !after.includes(name))).toEqual([])
  })

  it('exports the neutral layer too', async () => {
    const main = Object.keys(await import('../index.mjs'))
    const kernel = Object.keys(await import('../kernel.mjs'))

    expect(kernel.filter((name) => !main.includes(name))).toEqual([])
  })

  it('keeps the HTTP versions of the names both layers have', async () => {
    const main = await import('../index.mjs')
    const kernel = await import('../kernel.mjs')
    const http = await import('../application/http-module-options.mjs')
    const request = await import('../context/current-request-context.mjs')

    expect(main.Module).toBe(http.Module)
    expect(main.registerModule).toBe(http.registerModule)
    expect(main.currentContext).toBe(request.currentContext)
    expect(kernel.currentContext).not.toBe(main.currentContext)
  })
})
