import { getModuleMetadata, registerModule } from '@navios/core'
import { buildModuleGraph } from '@navios/core/transport'
import { describe, expect, it } from 'vitest'

import type { ModuleOptions } from '@navios/core'

import { computeModulePrefixes } from '../application/module-prefixes.mjs'

function module(name: string, options: ModuleOptions = {}) {
  const target = { [name]: class {} }[name]
  return registerModule(target, options)
}

class Ctl {}

describe('computeModulePrefixes', () => {
  it('joins the global prefix, importers and own', () => {
    const Users = module('Users', { prefix: 'users', controllers: [Ctl] })
    const Admin = module('Admin', { prefix: '/admin/', imports: [Users] })
    const Root = module('Root', { imports: [Admin] })

    const prefixes = computeModulePrefixes(buildModuleGraph([Root]), '/api')

    expect(prefixes.get(Root)).toBe('/api')
    expect(prefixes.get(Admin)).toBe('/api/admin')
    expect(prefixes.get(Users)).toBe('/api/admin/users')
  })

  it('rejects a module with controllers under two prefixes', () => {
    const Users = module('Users', { controllers: [Ctl] })
    const Left = module('Left', { prefix: 'a', imports: [Users] })
    const Right = module('Right', { prefix: 'b', imports: [Users] })
    const Root = module('Root', { imports: [Left, Right] })

    expect(() => computeModulePrefixes(buildModuleGraph([Root]), '')).toThrow(
      '[Navios] Module Users is imported under two different prefixes ("/a" and "/b"). ' +
        'A module with controllers can be mounted once.',
    )
  })

  it('accepts a module without controllers under two prefixes', () => {
    const Shared = module('Shared')
    const Left = module('Left', { prefix: 'a', imports: [Shared] })
    const Right = module('Right', { prefix: 'b', imports: [Shared] })
    const Root = module('Root', { imports: [Left, Right] })

    const prefixes = computeModulePrefixes(buildModuleGraph([Root]), '')

    expect(prefixes.get(Shared)).toBe('/a')
  })

  it('accepts a module with controllers reached twice under one prefix', () => {
    const Users = module('Users', { prefix: 'users', controllers: [Ctl] })
    const Left = module('Left', { imports: [Users] })
    const Right = module('Right', { imports: [Users] })
    const Root = module('Root', { imports: [Left, Right] })

    expect(computeModulePrefixes(buildModuleGraph([Root]), '').get(Users)).toBe('/users')
  })

  it('terminates on an import cycle', () => {
    const A = module('A', { prefix: 'a' })
    const B = module('B', { prefix: 'b', imports: [A] })
    getModuleMetadata(A).imports.push(B)

    expect(computeModulePrefixes(buildModuleGraph([A]), '').get(A)).toBe('/a')
  })
})
