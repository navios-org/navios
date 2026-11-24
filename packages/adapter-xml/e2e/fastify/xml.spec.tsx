import { defineFastifyEnvironment } from '@navios/adapter-fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { defineXmlSuite } from '../suite.mjs'

defineXmlSuite('the Fastify adapter', () => defineFastifyEnvironment(), {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
})
