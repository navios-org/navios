import { describe, expect, it } from 'vitest'

import { Inject } from '../decorators/inject.decorator.mjs'
import { getInjections, InjectionKind } from '../decorators/injection-metadata.mjs'
import { Token } from '../token/token.mjs'

describe('injection metadata (Symbol.metadata canonical store)', () => {
  it('stores and retrieves injections per class', () => {
    const tok = Token.create<string>('a')
    class A {
      @Inject(tok) accessor foo!: string
    }
    const entries = getInjections(A)
    expect(entries).toHaveLength(1)
    expect(entries[0].kind).toBe(InjectionKind.Eager)
    expect(entries[0].fieldName).toBe('foo')
    expect(entries[0].token).toBe(tok)
  })

  it('keeps entries isolated between unrelated classes', () => {
    const t = Token.create<string>('t')
    class A {
      @Inject(t) accessor x!: string
    }
    class B {}
    expect(getInjections(A)).toHaveLength(1)
    expect(getInjections(B)).toHaveLength(0)
  })

  describe('prototype-chain inheritance', () => {
    it('subclass inherits parent injections plus its own', () => {
      const ParentTok = Token.create<string>('parent-tok')
      const ChildTok = Token.create<string>('child-tok')

      class Parent {
        @Inject(ParentTok) accessor p!: string
      }
      class Child extends Parent {
        @Inject(ChildTok) accessor c!: string
      }

      const childEntries = getInjections(Child)
      const fields = childEntries.map((e) => e.fieldName).sort()
      expect(fields).toEqual(['c', 'p'])
      expect(childEntries.find((e) => e.fieldName === 'p')?.token).toBe(ParentTok)
      expect(childEntries.find((e) => e.fieldName === 'c')?.token).toBe(ChildTok)
    })

    it('subclass decoration does not mutate parent metadata', () => {
      const ParentTok = Token.create<string>('parent-only')

      class Parent {
        @Inject(ParentTok) accessor p!: string
      }

      const parentBefore = getInjections(Parent)
      expect(parentBefore).toHaveLength(1)

      const ChildTok = Token.create<string>('child-extra')
      class Child extends Parent {
        @Inject(ChildTok) accessor c!: string
      }
      // Touch Child so its metadata is fully realized.
      expect(getInjections(Child)).toHaveLength(2)

      const parentAfter = getInjections(Parent)
      expect(parentAfter).toHaveLength(1)
      expect(parentAfter[0].fieldName).toBe('p')
      expect(parentAfter[0].token).toBe(ParentTok)
    })

    it('subclass overriding a parent field name yields the subclass entry (no duplicate)', () => {
      const ParentTok = Token.create<string>('override-parent')
      const ChildTok = Token.create<string>('override-child')

      class Parent {
        @Inject(ParentTok) accessor svc!: string
      }
      class Child extends Parent {
        // Intentionally re-declares the parent field to test override semantics.
        // @ts-expect-error TS2612: deliberate override of the base accessor.
        @Inject(ChildTok) accessor svc!: string
      }

      const entries = getInjections(Child)
      const svcEntries = entries.filter((e) => e.fieldName === 'svc')
      expect(svcEntries).toHaveLength(1)
      expect(svcEntries[0].token).toBe(ChildTok)
    })

    it('three-level chain merges grandparent + parent + child', () => {
      const GP = Token.create<string>('gp')
      const P = Token.create<string>('p')
      const C = Token.create<string>('c')

      class GrandParent {
        @Inject(GP) accessor gp!: string
      }
      class Parent extends GrandParent {
        @Inject(P) accessor p!: string
      }
      class Child extends Parent {
        @Inject(C) accessor c!: string
      }

      const fields = getInjections(Child)
        .map((e) => e.fieldName)
        .sort()
      expect(fields).toEqual(['c', 'gp', 'p'])
    })
  })
})
