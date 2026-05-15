// oxlint-disable no-unused-vars
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { Container, Injectable, Registry, Token } from '../index.mjs'

describe('Container.tryGetSync soundness', () => {
  let registry: Registry
  let container: Container

  beforeEach(() => {
    registry = new Registry()
    container = new Container({ registry })
  })

  afterEach(async () => {
    await container.dispose()
  })

  it('returns null (does not throw) for a bare class not decorated with @Injectable', () => {
    class BareUnregisteredService {}

    let result: unknown
    expect(() => {
      result = container.tryGetSync(BareUnregisteredService)
    }).not.toThrow()
    expect(result).toBeNull()
  })

  it('returns null (does not throw) for a registered service that has not been resolved yet', () => {
    @Injectable({ registry })
    class RegisteredButNotYetResolvedService {}

    expect(() => {
      const result = container.tryGetSync(RegisteredButNotYetResolvedService)
      expect(result).toBeNull()
    }).not.toThrow()
  })

  it('returns the same cached instance for a registered service after it has been resolved', async () => {
    @Injectable({ registry })
    class RegisteredService {}

    const resolved = await container.get(RegisteredService)
    const synced = container.tryGetSync(RegisteredService)

    expect(synced).toBe(resolved)
  })

  it('returns null (does not throw) for a Token that was never registered', () => {
    const UnregisteredToken = Token.create<{ value: number }>('UnregisteredToken')

    let result: unknown
    expect(() => {
      result = container.tryGetSync(UnregisteredToken)
    }).not.toThrow()
    expect(result).toBeNull()
  })
})
