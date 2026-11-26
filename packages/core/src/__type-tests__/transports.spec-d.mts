import { describe, expectTypeOf, it } from 'vitest'

import { fakeTransport } from '../testing/index.mjs'

import type { Application } from '../application/application.mjs'
import type { PluginApi } from '../plugins/plugin.mjs'
import type { FakeTransport } from '../testing/index.mjs'

describe('transport lookup', () => {
  it('types the transport by its factory', () => {
    expectTypeOf((app: Application) =>
      app.transport(fakeTransport),
    ).returns.toEqualTypeOf<FakeTransport>()
    expectTypeOf((app: Application) => app.findTransport(fakeTransport, 'x')).returns.toEqualTypeOf<
      FakeTransport | undefined
    >()
    expectTypeOf((api: PluginApi) => api.transport(fakeTransport)).returns.toEqualTypeOf<
      FakeTransport | undefined
    >()
  })
})
