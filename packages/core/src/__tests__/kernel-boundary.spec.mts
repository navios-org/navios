import { existsSync, readFileSync } from 'node:fs'
import { isBuiltin } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const src = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Words that belong to HTTP and must not appear in this package's identifiers. */
const HTTP_IDENTIFIER = /\b(RequestContext|RouteInfo|HttpAdapter|HttpException|statusCode)\b/

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

describe('@navios/core', () => {
  const entries = ['index.mts', 'transport.mts', 'testing/index.mts', 'legacy-compat/index.mts']

  it.each(entries)('%s depends on @navios/di only', (entry) => {
    const { files, packages } = reach(entry)

    expect(files.length).toBeGreaterThan(1)
    expect(packages.filter((name) => !isBuiltin(name) && !name.startsWith('@navios/di'))).toEqual(
      [],
    )
  })

  it('has no HTTP type in its sources', () => {
    const offenders = entries
      .flatMap((entry) => reach(entry).files)
      .filter((file) => HTTP_IDENTIFIER.test(readFileSync(join(src, file), 'utf8')))

    expect([...new Set(offenders)]).toEqual([])
  })
})
