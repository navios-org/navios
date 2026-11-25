import { describe, expect, it } from 'vitest'

import { definePlugin } from '../plugins/index.mjs'
import { orderPlugins } from '../plugins/order-plugins.mjs'

function named(name: string, dependsOn?: string[]) {
  return definePlugin({ name, dependsOn, setup(_api, _options: Record<string, unknown>) {} })
}

describe('orderPlugins', () => {
  it('puts a plugin after those it depends on', () => {
    const a = named('a', ['b', 'c'])({})
    const b = named('b', ['c'])({})
    const c = named('c')({})

    expect(orderPlugins([a, b, c])).toEqual([c, b, a])
  })

  it('names a dependency that is missing, and a cycle', () => {
    expect(() => orderPlugins([named('a', ['b'])({})])).toThrow(
      'Plugin "a" depends on "b", which is not registered',
    )
    expect(() => orderPlugins([named('a', ['b'])({}), named('b', ['a'])({})])).toThrow(
      'cycle through "a"',
    )
  })

  it('applies one plugin once when its options are equal', () => {
    const plugin = named('otel')
    const shared = { exporter: () => {} }
    const first = plugin({ name: 'api', nested: { list: [1] }, ...shared })
    const none = definePlugin({ name: 'plain', setup() {} })

    expect(
      orderPlugins([first, plugin({ name: 'api', nested: { list: [1] }, ...shared })]),
    ).toEqual([first])
    expect(orderPlugins([none(), none()])).toHaveLength(1)
    expect(orderPlugins([plugin({ rate: Number.NaN }), plugin({ rate: Number.NaN })])).toHaveLength(
      1,
    )
  })

  it('refuses one plugin with two sets of options', () => {
    const plugin = named('otel')

    expect(() => orderPlugins([plugin({ name: 'a' }), plugin({ name: 'b' })])).toThrow(
      '[Navios] Plugin "otel" is registered twice with different options. Register it once.',
    )
    expect(() =>
      orderPlugins([plugin({ exporter: () => {} }), plugin({ exporter: () => {} })]),
    ).toThrow('registered twice with different options')
  })

  it('refuses two plugins of one name', () => {
    expect(() =>
      orderPlugins([
        definePlugin({ name: 'metrics', setup() {} })(),
        definePlugin({ name: 'metrics', setup() {} })(),
      ]),
    ).toThrow('[Navios] Two plugins are named "metrics".')
  })
})
