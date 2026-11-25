import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import * as core from '@navios/core'
import { describe, expect, it } from 'vitest'

import { currentContext } from '../context/current-request-context.mjs'
import * as server from '../index.mjs'

const here = dirname(fileURLToPath(import.meta.url))

/** The names `@navios/core` exported at runtime before HTTP moved to this package. */
const exportsBefore = JSON.parse(
  readFileSync(join(here, 'fixtures/index-exports.json'), 'utf8'),
) as string[]

describe('the main entry', () => {
  it('exports everything @navios/core exported before the split', () => {
    const now = Object.keys(server)

    expect(exportsBefore.filter((name) => !now.includes(name))).toEqual([])
  })

  it('exports everything of @navios/core', () => {
    const now = Object.keys(server)

    expect(Object.keys(core).filter((name) => !now.includes(name))).toEqual([])
  })

  it('keeps the HTTP version of currentContext and the one Module', () => {
    expect(server.currentContext).toBe(currentContext)
    expect(server.currentContext).not.toBe(core.currentContext)
    expect(server.Module).toBe(core.Module)
  })
})
