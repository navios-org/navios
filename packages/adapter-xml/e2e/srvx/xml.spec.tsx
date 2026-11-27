import { defineSrvxEnvironment } from '@navios/adapter-srvx'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { defineXmlSuite } from '../suite.mjs'

defineXmlSuite('the srvx adapter', () => defineSrvxEnvironment(), {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
})
