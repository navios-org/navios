import { describe, expect, it } from 'vitest'

import { InjectDerived } from '../decorators/inject-derived.decorator.mjs'
import { InjectLazy } from '../decorators/inject-lazy.decorator.mjs'
import { InjectOptional } from '../decorators/inject-optional.decorator.mjs'
import { getInjections, InjectionKind } from '../decorators/injection-metadata.mjs'
import { Token } from '../token/token.mjs'

describe('@Inject variants', () => {
  it('@InjectLazy registers a lazy entry', () => {
    const T = Token.create<{}>('T')
    class S {
      @InjectLazy(T) accessor t!: Promise<{}>
    }
    expect(getInjections(S)[0].kind).toBe(InjectionKind.Lazy)
  })

  it('@InjectOptional registers an optional entry', () => {
    const T = Token.create<{}>('T')
    class S {
      @InjectOptional(T) accessor t!: {} | null
    }
    expect(getInjections(S)[0].kind).toBe(InjectionKind.Optional)
  })

  it('@InjectDerived registers a derived entry with the callback stored', () => {
    const T = Token.create<{}>('T')
    const derive = (a: { x: number }) => ({ size: a.x })
    class S {
      @InjectDerived(T, derive) accessor t!: {}
    }
    const e = getInjections(S)[0]
    expect(e.kind).toBe(InjectionKind.Derived)
    if (e.kind === InjectionKind.Derived) expect(e.derive).toBe(derive)
  })
})
