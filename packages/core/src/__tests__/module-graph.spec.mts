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

    expect(leaf.guards).toEqual([G1, G2, G3])
    expect(leaf.interceptors).toEqual([I1])
  })

  it('puts what a shared module inherits before its own, whatever the import order', () => {
    class GRoot {}
    class GA {}
    class GB {}
    class GShared {}
    class IA {}
    class IShared {}
    const build = (order: 'shared-first' | 'shared-last') => {
      const Shared = module('Shared', { guards: [GShared], interceptors: [IShared] })
      const A = module('A', { imports: [Shared], guards: [GA], interceptors: [IA] })
      const B = module('B', { imports: [Shared], guards: [GB] })
      const Root = module('Root', {
        imports: order === 'shared-first' ? [Shared, A, B] : [A, B, Shared],
        guards: [GRoot],
      })
      return buildModuleGraph([Root]).find((node) => node.module === Shared)!
    }

    for (const order of ['shared-first', 'shared-last'] as const) {
      const shared = build(order)

      expect(shared.guards).toEqual([GRoot, GA, GB, GShared])
      expect(shared.interceptors).toEqual([IA, IShared])
    }
  })

  it('gives a shared module the nearest attribute, whatever the import order', () => {
    const Tier = AttributeFactory.createAttribute(Symbol.for('test.graph.SharedTier'), {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: (value: unknown) => ({ value: value as string }),
      },
    } as any)
    const build = (order: 'far-first' | 'near-first') => {
      const Shared = module('Shared')
      const Near = module('Near', { imports: [Shared], attributes: [Tier('near')] })
      const Middle = module('Middle', { imports: [Shared] })
      const Far = module('Far', { imports: [Middle], attributes: [Tier('far')] })
      const Root = module('Root', { imports: order === 'far-first' ? [Far, Near] : [Near, Far] })
      return buildModuleGraph([Root]).find((node) => node.module === Shared)!
    }

    expect(build('far-first').attributes.get(Tier.token)).toBe('near')
    expect(build('near-first').attributes.get(Tier.token)).toBe('near')
  })

  it('walks a deep lattice of shared imports once per module', () => {
    class Outer {}
    const all: ReturnType<typeof module>[] = []
    let layer: ReturnType<typeof module>[] = []
    for (let depth = 0; depth < 25; depth++) {
      layer = [module(`L${depth}`, { imports: layer }), module(`R${depth}`, { imports: layer })]
      all.push(...layer)
    }
    const Root = module('Root', { imports: layer, guards: [Outer] })
    const reads = new Map<unknown, number>()
    for (const target of [Root, ...all]) {
      const metadata = getModuleMetadata(target)
      const imports = metadata.imports
      Object.defineProperty(metadata, 'imports', {
        get() {
          reads.set(target, (reads.get(target) ?? 0) + 1)
          return imports
        },
      })
    }

    const graph = buildModuleGraph([Root])

    expect(graph).toHaveLength(51)
    expect(graph.at(-1)!.module).toBe(Root)
    expect(graph[0].guards).toEqual([Outer])
    expect(graph[0].importers).toHaveLength(2)
    expect(Math.max(...reads.values())).toBeLessThanOrEqual(3)
  })

  it('names the importer of an undefined import', () => {
    expect(() => module('Importer', { imports: [undefined as any] })).toThrow(
      '[Navios] Module Importer imports undefined',
    )

    const Late = module('Late')
    getModuleMetadata(Late).imports.push(undefined as any)
    expect(() => buildModuleGraph([Late])).toThrow('[Navios] Module Late imports undefined')
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
