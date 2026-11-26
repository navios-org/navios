import { describe, expect, it } from 'vitest'

import type { StandardSchemaV1 } from '@navios/di'

import { AttributeFactory } from '../attributes/attribute-factory.mjs'
import { applyAttributes } from '../attributes/attribute-value.mjs'
import { UseGuards } from '../guards/use-guards.mjs'
import { buildModuleGraph } from '../modules/module-graph.mjs'
import { getModuleMetadata } from '../modules/module-metadata.mjs'
import { Module, registerModule } from '../modules/module.mjs'

import type { ModuleOptions } from '../modules/module-options.mjs'

/* eslint-disable @typescript-eslint/no-explicit-any */

function module(name: string, options: ModuleOptions & Record<string, unknown> = {}) {
  const target = { [name]: class {} }[name]
  return registerModule(target, options as ModuleOptions)
}

class AnyGuard {
  canActivate() {
    return true
  }
}

class AnyInterceptor {
  intercept(_ctx: unknown, next: () => Promise<unknown>) {
    return next()
  }
}

function anySchema<T>(): StandardSchemaV1<T, T> {
  return {
    '~standard': { version: 1, vendor: 'test', validate: (value) => ({ value: value as T }) },
  }
}

const Tier = AttributeFactory.createAttribute(Symbol.for('test.graph.Tier'), anySchema<string>())
const Roles = AttributeFactory.createAttribute(
  Symbol.for('test.graph.Roles'),
  anySchema<string[]>(),
)
const Public = AttributeFactory.createAttribute(Symbol.for('test.graph.Public'))

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
    class G1 extends AnyGuard {}
    class G2 extends AnyGuard {}
    class G3 extends AnyGuard {}
    class I1 extends AnyInterceptor {}
    const Leaf = module('Leaf', { guards: [G3] })
    const Left = module('Left', { imports: [Leaf], guards: [G1], interceptors: [I1] })
    const Right = module('Right', { imports: [Leaf], guards: [G2] })
    const Root = module('Root', { imports: [Left, Right] })

    const leaf = buildModuleGraph([Root])[0]

    expect(leaf.guards).toEqual([G1, G2, G3])
    expect(leaf.interceptors).toEqual([I1])
  })

  it('puts what a shared module inherits before its own, whatever the import order', () => {
    class GRoot extends AnyGuard {}
    class GA extends AnyGuard {}
    class GB extends AnyGuard {}
    class GShared extends AnyGuard {}
    class IA extends AnyInterceptor {}
    class IShared extends AnyInterceptor {}
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

  /** What the importers of a module disagree about. */
  function disputed(target: unknown, roots: ReturnType<typeof module>[]) {
    return buildModuleGraph(roots).find((node) => node.module === target)!.disputed
  }

  it('records what the importers of a shared module disagree about', () => {
    const Shared = module('Shared')
    const Near = module('Near', { imports: [Shared], attributes: [Tier('near')] })
    const Middle = module('Middle', { imports: [Shared] })
    const Far = module('Far', { imports: [Middle], attributes: [Tier('far')] })
    const of = (imports: ReturnType<typeof module>[]) => {
      const Root = module('Root', { imports })
      const { attributes } = buildModuleGraph([Root]).find((node) => node.module === Shared)!
      expect(attributes.has(Tier.token)).toBe(false)
      return disputed(Shared, [Root]).get(Tier.token)
    }

    expect(of([Near, Far])).toBe(
      'one over Root -> Near -> Shared, another over Root -> Far -> Middle -> Shared',
    )
    expect(of([Far, Near])).toBe(
      'one over Root -> Far -> Middle -> Shared, another over Root -> Near -> Shared',
    )
    expect(of([Near, Shared])).toBe('one over Root -> Near -> Shared, none over Root -> Shared')
    expect(of([Shared, Near])).toBe('one over Root -> Near -> Shared, none over Root -> Shared')
  })

  it('records it for what such a module imports as well', () => {
    const Inner = module('Inner')
    const Group = module('Group', { imports: [Inner] })
    const A = module('A', { imports: [Group], attributes: [Tier('a')] })
    const B = module('B', { imports: [Group] })
    const Root = module('Root', { imports: [A, B] })

    expect(disputed(Inner, [Root]).get(Tier.token)).toBe(
      'one over Root -> A -> Group -> Inner, none over Root -> B -> Group -> Inner',
    )
  })

  it('records it for a module that is a root as well', () => {
    const Shared = module('Shared')
    const Root = module('Root', { imports: [Shared], attributes: [Tier('root')] })

    expect(disputed(Shared, [Root, Shared]).get(Tier.token)).toBe(
      'one over Root -> Shared, none over Shared',
    )
  })

  it('accepts importers that agree, and a module that decides for itself', () => {
    const Leaf = module('Leaf')
    const Own = module('Own', { attributes: [Tier('own')], imports: [Leaf] })
    const Agreed = module('Agreed')
    const A = module('A', { imports: [Own, Agreed], attributes: [Roles(['x'])] })
    const B = module('B', {
      imports: [Own, Agreed],
      attributes: [Roles(['x']), Public()],
    })
    const Root = module('Root', { imports: [A, module('D', { imports: [B] })] })

    expect([...disputed(Agreed, [Root]).keys()]).toEqual([Public.token])
    applyAttributes(getModuleMetadata(A).attributes, [Public()])

    const at = (target: unknown) =>
      buildModuleGraph([Root]).find((node) => node.module === target)!.attributes
    for (const target of [Leaf, Own, Agreed]) {
      expect(disputed(target, [Root]).size).toBe(0)
    }
    expect(at(Agreed).get(Roles.token)).toEqual(['x'])
    expect(at(Own).get(Tier.token)).toBe('own')
    expect(at(Leaf).get(Tier.token)).toBe('own')
  })

  it('walks a deep lattice of shared imports once per module', () => {
    class Outer extends AnyGuard {}
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
    const Leaf = module('Leaf', { attributes: [Tier('leaf')] })
    const Plain = module('Plain')
    const Root = module('Root', { imports: [Leaf, Plain], attributes: [Tier('root')] })

    const graph = buildModuleGraph([Root])

    expect(graph.find((node) => node.module === Leaf)!.attributes.get(Tier.token)).toBe('leaf')
    expect(graph.find((node) => node.module === Plain)!.attributes.get(Tier.token)).toBe('root')
  })

  it('refuses an import cycle, naming it', () => {
    const CycleA = module('CycleA')
    const CycleB = module('CycleB', { imports: [CycleA] })
    getModuleMetadata(CycleA).imports.push(CycleB)
    const Root = module('Root', { imports: [CycleB] })
    const Self = module('Self')
    getModuleMetadata(Self).imports.push(Self)

    expect(() => buildModuleGraph([Root])).toThrow(
      '[Navios] Modules import each other in a cycle: CycleB -> CycleA -> CycleB',
    )
    expect(() => buildModuleGraph([CycleA])).toThrow('CycleA -> CycleB -> CycleA')
    expect(() => buildModuleGraph([Self])).toThrow('Self -> Self')
  })
})

describe('module metadata', () => {
  class GBase extends AnyGuard {}
  class GOption extends AnyGuard {}
  class GOwn extends AnyGuard {}
  class IBase extends AnyInterceptor {}

  it('refuses to define one module twice', () => {
    class Twice {}
    registerModule(Twice, { guards: [GBase] })

    expect(() => registerModule(Twice, {})).toThrow('[Navios] Twice is already a module.')
    expect(() => {
      @Module()
      @Module({ guards: [GBase] })
      class Decorated {}
      return Decorated
    }).toThrow('[Navios] Decorated is already a module.')
  })

  it('refuses what is not a provider, naming the module', () => {
    class UsersService {}
    const list = (provider: unknown) => () => module('Users', { providers: [provider as any] })

    expect(list(UsersService)).toThrow(
      '[Navios] Users lists UsersService in providers, which is not a provider. Use ' +
        'provide(token, ...); an @Injectable class needs no entry.',
    )
    expect(list({ provide: UsersService, useClass: UsersService })).toThrow(
      'Users lists an object in providers',
    )
    expect(list(undefined)).toThrow('Users lists undefined in providers')
    expect(list(null)).toThrow('Users lists null in providers')
  })

  it('is inherited by a subclass, however the two are defined', () => {
    @UseGuards(GBase)
    @Module({
      guards: [GOption],
      interceptors: [IBase],
      attributes: [Tier('base')],
    })
    class DecoratedBase {}
    class RegisteredBase {}
    registerModule(RegisteredBase, {
      guards: [GBase, GOption],
      interceptors: [IBase],
      attributes: [Tier('base')],
    })

    @Module({ guards: [GOwn] })
    class A extends DecoratedBase {}
    @Module({ guards: [GOwn] })
    class B extends RegisteredBase {}
    class C extends DecoratedBase {}
    registerModule(C, { guards: [GOwn] })
    class D extends RegisteredBase {}
    registerModule(D, { guards: [GOwn] })

    for (const target of [A, B, C, D]) {
      const { guards, interceptors, attributes } = getModuleMetadata(target)

      expect([...guards].sort(byName)).toEqual([GBase, GOption, GOwn])
      expect(interceptors).toEqual([IBase])
      expect(attributes.get(Tier.token)).toBe('base')
    }
    expect(getModuleMetadata(D).guards).toEqual(getModuleMetadata(B).guards)
    for (const target of [DecoratedBase, RegisteredBase]) {
      expect([...getModuleMetadata(target).guards].sort(byName)).toEqual([GBase, GOption])
    }
  })
})

function byName(left: { name: string }, right: { name: string }): number {
  return left.name.localeCompare(right.name)
}
