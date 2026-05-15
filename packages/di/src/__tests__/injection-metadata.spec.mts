import { describe, expect, it } from 'vitest'

import {
  getInjections,
  InjectionKind,
  registerInjection,
} from '../decorators/injection-metadata.mjs'
import { Token } from '../token/token.mjs'

describe('injection metadata', () => {
  it('stores and retrieves injections per class', () => {
    class A {}
    const tok = Token.create<string>('a')
    registerInjection(A, { kind: InjectionKind.Eager, fieldName: 'foo', token: tok })
    const entries = getInjections(A)
    expect(entries).toHaveLength(1)
    expect(entries[0].kind).toBe(InjectionKind.Eager)
    expect(entries[0].fieldName).toBe('foo')
    expect(entries[0].token).toBe(tok)
  })

  it('keeps entries isolated between classes', () => {
    class A {}
    class B {}
    const t = Token.create<string>('t')
    registerInjection(A, { kind: InjectionKind.Eager, fieldName: 'x', token: t })
    expect(getInjections(B)).toHaveLength(0)
  })
})
