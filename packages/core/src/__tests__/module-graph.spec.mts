import { describe, expect, it } from 'vitest'

import { AttributeFactory } from '../attributes/index.mjs'
import { buildModuleGraph, getModuleMetadata, registerModule } from '../modules/index.mjs'

import type { ModuleOptions } from '../modules/index.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

function module(name: string, options: ModuleOptions & Record<string, unknown> = {}) {
  const target = { [name]: class {} }[name]
  return registerModule(target, options as ModuleOptions)
}

describe('buildModuleGraph', () => {
  it('keeps unknown options in entries, as written', () => {
    class A {}
    class B {}
    const Shared = module('Shared')
    const commands = [A]
    const M = module('M', { imports: [Shared], commands, controllers: [B], providers: [] })

    const node = buildModuleGraph([M]).at(-1)!

    expect(node.module).toBe(M)
    expect(node.entries.get('commands')).toBe(commands)
    expect(node.entries.get('controllers')).toEqual([B])
    for (const known of ['imports', 'providers', 'guards', 'interceptors', 'attributes']) {
      expect(node.entries.has(known)).toBe(false)
    }
  })

  it('orders dependencies first and links importers', () => {
    const Shared = module('Shared')
    const A = module('A', { imports: [Shared] })
    const Root = module('Root', { imports: [A, Shared] })

    const graph = buildModuleGraph([Root])
    const [shared, a, root] = graph

    expect(graph.map((node) => node.module)).toEqual([Shared, A, Root])
    expect(shared.importers.map((node) => node.module).sort()).toEqual([A, Root].sort())
    expect(a.importers).toEqual([root])
    expect(root.importers).toEqual([])
    expect(root.isRoot).toBe(true)
    expect(shared.isRoot).toBe(false)
  })

  it('marks every given root, also one that another root imports', () => {
    const Extra = module('Extra')
    const Root = module('Root', { imports: [Extra] })

    const graph = buildModuleGraph([Root, Extra])

    expect(graph.find((node) => node.module === Extra)!.isRoot).toBe(true)
  })

  it('unions guards and interceptors over every import path, outermost first', () => {
    class G1 {}
    class G2 {}
    class G3 {}
    class I1 {}
    const Leaf = module('Leaf', { guards: [G3] })
    const Left = module('Left', { imports: [Leaf], guards: [G1], interceptors: [I1] })
    const Right = module('Right', { imports: [Leaf], guards: [G2] })
    const Root = module('Root', { imports: [Left, Right] })

    const leaf = buildModuleGraph([Root])[0]

    expect(leaf.guards).toEqual([G1, G3, G2])
    expect(leaf.interceptors).toEqual([I1])
  })

  it('lets the nearest module win for attributes', () => {
    const Tier = AttributeFactory.createAttribute(Symbol.for('test.graph.Tier'), {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: (value: unknown) => ({ value: value as string }),
      },
    } as any)
    const Leaf = module('Leaf', { attributes: [Tier('leaf')] })
    const Plain = module('Plain')
    const Root = module('Root', { imports: [Leaf, Plain], attributes: [Tier('root')] })

    const graph = buildModuleGraph([Root])

    expect(graph.find((node) => node.module === Leaf)!.attributes.get(Tier.token)).toBe('leaf')
    expect(graph.find((node) => node.module === Plain)!.attributes.get(Tier.token)).toBe('root')
  })

  it('terminates on an import cycle', () => {
    const CycleA = module('CycleA')
    const CycleB = module('CycleB', { imports: [CycleA] })
    getModuleMetadata(CycleA).imports.push(CycleB)

    expect(buildModuleGraph([CycleA])).toHaveLength(2)
  })
})
