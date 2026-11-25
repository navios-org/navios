import { describe, expect, it } from 'vitest'

import { handlerChain } from '../metadata/handler-chain.mjs'

class App {}
class G1 {}
class G2 {}
class G3 {}
class I1 {}
class I2 {}
class I3 {}

describe('handlerChain', () => {
  it('orders the chain and removes duplicates', () => {
    expect(
      handlerChain({
        application: [App],
        node: { guards: [G1], interceptors: [I1] },
        owner: { guards: [G2, G1], interceptors: [I2] },
        member: { guards: [G3], interceptors: [App, I3] },
      }),
    ).toEqual({ guards: [G1, G2, G3], interceptors: [App, I1, I2, I3] })
  })

  it('returns new arrays', () => {
    const node = { guards: [G1], interceptors: [] }
    const chain = handlerChain({
      application: [],
      node,
      owner: { guards: [], interceptors: [] },
      member: { guards: [], interceptors: [] },
    })

    chain.guards.push(G2)

    expect(node.guards).toEqual([G1])
  })
})
