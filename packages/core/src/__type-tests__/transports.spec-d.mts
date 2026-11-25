import { describe, expectTypeOf, it } from 'vitest'

import { fakeTransport } from '../__tests__/helpers/fake-transport.mjs'

import type { FakeTransport } from '../__tests__/helpers/fake-transport.mjs'
import type { Application } from '../application/application.mjs'
import type { PluginApi } from '../plugins/index.mjs'

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
