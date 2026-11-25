import { describe, expect, it } from 'vitest'

import type { ClassType } from '@navios/di'

import { AttributeFactory } from '../attributes/index.mjs'
import { getModuleMetadata } from '../modules/index.mjs'

import type { HandlerClassMetadata } from '../metadata/handler-class.mjs'

class AnyGuard {
  canActivate() {
    return true
  }
}
export class GuardBase extends AnyGuard {}
export class GuardChild extends AnyGuard {}
export class GuardMember extends AnyGuard {}
export class GuardOption extends AnyGuard {}
export class Around {
  intercept(_ctx: unknown, next: () => Promise<unknown>) {
    return next()
  }
}

/** The same classes, declared with either kind of decorators. */
export interface InheritanceFixture {
  /** What `describeHandlerClass` made of each class, by class. */
  described: Map<ClassType, HandlerClassMetadata>
  Marked: { token: symbol }
  Level: { token: symbol }
  BaseModule: ClassType
  ChildModule: ClassType
  Below: ClassType
  Above: ClassType
  Base: ClassType
  Child: ClassType
  Overriding: ClassType
  Crud: ClassType
  Plain: ClassType
  Grandchild: ClassType
}

function names(list: readonly ClassType[]): string[] {
  return list.map((cls) => cls.name).sort()
}

/** What has to be the same for standard and for legacy decorators. */
export function describeInheritance(fixture: InheritanceFixture): void {
  const of = (target: ClassType) => fixture.described.get(target)!
  const member = (target: ClassType, name: string) => of(target).members.get(name)

  describe('inheritance of what decorators attach', () => {
    it('gives a module what its base class has', () => {
      const child = getModuleMetadata(fixture.ChildModule)

      expect(names(child.guards)).toEqual(['GuardBase', 'GuardChild', 'GuardOption'])
      expect(names(child.interceptors)).toEqual(['Around'])
      expect(child.attributes.get(fixture.Level.token)).toBe('base')
    })

    it('leaves the base class of a module alone', () => {
      const base = getModuleMetadata(fixture.BaseModule)

      expect(names(base.guards)).toEqual(['GuardBase', 'GuardOption'])
      expect(base.attributes.has(fixture.Marked.token)).toBe(false)
    })

    it('reads @UseGuards above and below @Module', () => {
      const expected = ['GuardBase', 'GuardOption']

      expect(names(getModuleMetadata(fixture.Above).guards)).toEqual(expected)
      expect(names(getModuleMetadata(fixture.Below).guards)).toEqual(expected)
    })

    it('gives a class of handlers what its base class has', () => {
      expect(names(of(fixture.Child).guards)).toEqual(['GuardBase', 'GuardChild'])
      expect(names(of(fixture.Child).interceptors)).toEqual(['Around'])
      expect([...of(fixture.Child).members.keys()].sort()).toEqual(['inherited', 'own'])
      expect(names(member(fixture.Child, 'inherited')!.guards)).toEqual(['GuardMember'])
      expect(member(fixture.Child, 'inherited')!.attributes.get(fixture.Marked.token)).toBe(true)
    })

    it('leaves the base class of handlers alone', () => {
      expect(names(of(fixture.Base).guards)).toEqual(['GuardBase'])
      expect([...of(fixture.Base).members.keys()]).toEqual(['inherited'])
      expect(of(fixture.Base).attributes.get(fixture.Level.token)).toBe('base')
      expect(names(member(fixture.Base, 'inherited')!.guards)).toEqual(['GuardMember'])
    })

    it('keeps what a member has when a subclass overrides it', () => {
      const overridden = member(fixture.Overriding, 'inherited')!

      expect(names(overridden.guards)).toEqual(['GuardChild', 'GuardMember'])
      expect(overridden.attributes.get(fixture.Marked.token)).toBe(true)
      expect(of(fixture.Overriding).attributes.get(fixture.Level.token)).toBe('child')
    })

    it('reaches through a class without decorators, and from an abstract one', () => {
      expect(names(of(fixture.Grandchild).guards)).toEqual(['GuardBase'])
      expect(names(member(fixture.Crud, 'removeAll')!.guards)).toEqual(['GuardMember'])
      expect(names(member(fixture.Crud, 'field')!.guards)).toEqual(['GuardMember'])
    })

    it('gives a class without any nothing', () => {
      expect(of(fixture.Plain)).toEqual({
        guards: [],
        interceptors: [],
        attributes: new Map(),
        members: new Map(),
      })
    })

    it('can be read with either AttributeFactory', () => {
      const attributes = { attributes: of(fixture.Child).attributes }

      expect(AttributeFactory.get(fixture.Level as never, attributes)).toBe('base')
      expect(AttributeFactory.has(fixture.Marked, attributes)).toBe(false)
    })
  })
}

export const textSchema = {
  '~standard': {
    version: 1 as const,
    vendor: 'test',
    validate: (value: unknown) => ({ value: value as string }),
    types: undefined as { input: string; output: string } | undefined,
  },
}
