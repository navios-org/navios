import { describe, expect, it } from 'vitest'

import { Container, InjectableScope } from '../index.mjs'
import {
  createClassContext,
  createMethodContext,
  Factory,
  Injectable,
} from '../legacy-compat/index.mjs'

// What a compiler does with `experimentalDecorators` on.
const decorateClass = <T,>(decorator: (target: any) => unknown, target: T): T =>
  (decorator(target) as T | undefined) ?? target
const methodContext = (target: object, key: string) =>
  createMethodContext(target, key, Object.getOwnPropertyDescriptor(target, key) ?? {})

const metadataOf = (target: new () => object) =>
  createClassContext(target).metadata as Record<PropertyKey, unknown>
const memberMetadata = (target: object, key: string) =>
  methodContext(target, key).metadata as Record<PropertyKey, unknown>

describe('legacy-compat', () => {
  it('registers classes', async () => {
    const Service = decorateClass(
      Injectable({ scope: InjectableScope.Transient }),
      class Service {},
    )
    const Made = decorateClass(
      Factory(),
      class Made {
        create() {
          return { made: true }
        }
      },
    )
    const container = new Container()
    expect(await container.get(Service)).not.toBe(await container.get(Service))
    expect(await container.get(Made)).toEqual({ made: true })
    await container.dispose()
  })

  describe('metadata', () => {
    it('is one object for a class and its members', () => {
      class Base {
        method() {}
        static staticMethod() {}
      }
      const { metadata } = createClassContext(Base)
      expect(methodContext(Base.prototype, 'method').metadata).toBe(metadata)
      expect(methodContext(Base.prototype, 'field').metadata).toBe(metadata)
      expect(methodContext(Base, 'staticMethod').metadata).toBe(metadata)
    })

    // With standard decorators, `context.metadata` of a subclass has the
    // metadata of its base as prototype.
    it('is inherited from the base class, whatever is decorated first', () => {
      class Base {
        remove() {}
      }
      class Child extends Base {
        add() {}
      }
      class Grandchild extends Child {}

      memberMetadata(Base.prototype, 'remove').guards = ['DenyAll']
      const grandchild = metadataOf(Grandchild)
      const child = memberMetadata(Child.prototype, 'add')

      expect(child.guards).toEqual(['DenyAll'])
      expect(grandchild.guards).toEqual(['DenyAll'])
      expect(Object.getPrototypeOf(grandchild)).toBe(child)
      expect(Object.getPrototypeOf(child)).toBe(metadataOf(Base))
      expect(Object.getPrototypeOf(metadataOf(Base))).toBeNull()
    })

    it('of a subclass does not change its base or its siblings', () => {
      class Base {}
      class Child extends Base {}
      class Sibling extends Base {}

      metadataOf(Base).guards = ['GBase']
      metadataOf(Child).guards = ['GChild']

      expect(metadataOf(Base).guards).toEqual(['GBase'])
      expect(metadataOf(Sibling).guards).toEqual(['GBase'])
      expect(Object.hasOwn(metadataOf(Sibling), 'guards')).toBe(false)
      expect(metadataOf(Child).guards).toEqual(['GChild'])
    })

    it('is inherited through an abstract class that is not decorated itself', () => {
      abstract class Base {
        remove() {}
      }
      abstract class Middle extends Base {}
      class Child extends Middle {}

      memberMetadata(Base.prototype, 'remove').guards = ['DenyAll']
      expect(metadataOf(Child).guards).toEqual(['DenyAll'])
    })
  })

  describe('a member context', () => {
    it('tells static members from instance members', () => {
      class Service {
        method() {}
        static staticMethod() {}
      }
      expect(methodContext(Service.prototype, 'method').static).toBe(false)
      expect(methodContext(Service, 'staticMethod').static).toBe(true)
      expect(methodContext(Service, 'staticMethod').access.get(Service as any)).toBe(
        Service.staticMethod,
      )
    })

    it('is refused for something that is not a member', () => {
      expect(() => createMethodContext(null, 'x', {})).toThrow('legacy member decorator')
    })
  })
})
