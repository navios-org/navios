import { Container } from '../container/container.mjs'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

describe('Container.internals', () => {
  let container: Container

  beforeEach(() => {
    container = new Container()
  })

  afterEach(async () => {
    await container.dispose()
  })

  it('exposes all internal components behind a single namespace', () => {
    expect(container.internals).toBeDefined()
    expect(container.internals.registry).toBeDefined()
    expect(container.internals.storage).toBeDefined()
    expect(container.internals.eventBus).toBeDefined()
    expect(container.internals.resolver).toBeDefined()
    expect(container.internals.serviceInitializer).toBeDefined()
    expect(container.internals.serviceInvalidator).toBeDefined()
    expect(container.internals.tokenResolver).toBeDefined()
    expect(container.internals.nameResolver).toBeDefined()
    expect(container.internals.pluginRegistry).toBeDefined()
  })

  it('no longer exposes the removed top-level component getters', () => {
    const c = container as any
    expect(c.getStorage).toBeUndefined()
    expect(c.getServiceInitializer).toBeUndefined()
    expect(c.getServiceInvalidator).toBeUndefined()
    expect(c.getTokenResolver).toBeUndefined()
    expect(c.getNameResolver).toBeUndefined()
    expect(c.getEventBus).toBeUndefined()
    expect(c.getInstanceResolver).toBeUndefined()
    expect(c.getRegistry).toBeUndefined()
    expect(c.getPluginRegistry).toBeUndefined()
  })

  it('freezes the internals namespace', () => {
    expect(Object.isFrozen(container.internals)).toBe(true)
    expect(() => {
      ;(container.internals as any).registry = null
    }).toThrow()
  })
})

describe('ScopedContainer.internals', () => {
  let container: Container

  beforeEach(() => {
    container = new Container()
  })

  afterEach(async () => {
    await container.dispose()
  })

  it('exposes its own request storage and delegates the rest to the parent', () => {
    const scoped = container.beginRequest('req-internals')

    expect(scoped.internals).toBeDefined()
    expect(Object.isFrozen(scoped.internals)).toBe(true)
    // Own request-scoped storage, distinct from the parent's singleton storage.
    expect(scoped.internals.storage).toBeDefined()
    expect(scoped.internals.storage).not.toBe(container.internals.storage)
    // Delegated components share the parent's instances.
    expect(scoped.internals.tokenResolver).toBe(container.internals.tokenResolver)
    expect(scoped.internals.nameResolver).toBe(container.internals.nameResolver)
    expect(scoped.internals.serviceInvalidator).toBe(
      container.internals.serviceInvalidator,
    )
    expect(scoped.internals.resolver).toBe(container.internals.resolver)
    expect(scoped.internals.registry).toBe(container.internals.registry)

    const c = scoped as any
    expect(c.getStorage).toBeUndefined()
  })
})
