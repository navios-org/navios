import { afterAll, beforeAll, describe, expect, it } from 'bun:test'

import { defineBunEnvironment } from '@navios/adapter-bun'

import { defineXmlSuite } from '../suite.mjs'

defineXmlSuite('the Bun adapter', () => defineBunEnvironment(), {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
})
