import { describe, expect, it } from 'vitest'

import { Inject } from '../decorators/inject.decorator.mjs'
import { getInjections, InjectionKind } from '../decorators/injection-metadata.mjs'
import { Token } from '../token/token.mjs'

describe('@Inject', () => {
  it('registers an eager injection on the class', () => {
    const Logger = Token.create<{}>('Logger')
    class Service {
      @Inject(Logger) accessor logger!: any
    }
    const entries = getInjections(Service)
    expect(entries).toHaveLength(1)
    expect(entries[0].kind).toBe(InjectionKind.Eager)
    expect(entries[0].token).toBe(Logger)
    expect(entries[0].fieldName).toBe('logger')
  })

  it('passes args through to the metadata entry', () => {
    const Sized = Token.create<{}>('Sized')
    class Service {
      @Inject(Sized, { size: 10 }) accessor val!: any
    }
    const entries = getInjections(Service)
    expect(entries[0]).toMatchObject({ args: { size: 10 } })
  })
})
