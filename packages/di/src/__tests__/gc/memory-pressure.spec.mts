/**
 * Garbage Collection Tests: Memory Pressure
 *
 * Tests that verify the DI container properly handles memory under pressure
 * and doesn't leak memory over time, by measuring the memory in use.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { Container } from '../../container/container.mjs'
import { Injectable } from '../../decorators/injectable.mjs'
import { InjectableScope } from '../../injectable-scope.mjs'
import { inject } from '../../internal/inject-impl.mjs'

import type { OnServiceDestroy } from '../../lifecycle-hooks.mjs'

import { memoryInUse } from './gc-test-utils.mjs'

const MB = 1024 * 1024

describe('GC: Memory Pressure', () => {
  let container: Container

  beforeEach(() => {
    container = new Container()
  })

  afterEach(async () => {
    await container.dispose()
  })

  it('is measured with typed arrays, which are not on the heap', async () => {
    const before = await memoryInUse()
    let kept: Uint8Array[] = Array.from({ length: 10 }, () => new Uint8Array(MB))
    expect((await memoryInUse()) - before).toBeGreaterThan(9 * MB)
    expect(kept).toHaveLength(10)

    kept = []
    expect((await memoryInUse()) - before).toBeLessThan(MB)
  })

  it('should reclaim memory when container with many singletons is disposed', async () => {
    const services = Array.from({ length: 50 }, () => {
      @Injectable()
      class LargeService {
        public readonly data = new Uint8Array(MB / 10)
      }
      return LargeService
    })

    const before = await memoryInUse()
    for (const service of services) {
      await container.get(service)
    }
    expect((await memoryInUse()) - before).toBeGreaterThan(4 * MB)

    await container.dispose()
    container = new Container()
    expect((await memoryInUse()) - before).toBeLessThan(MB / 2)
  })

  it('should reclaim the memory of each container on its own', async () => {
    @Injectable()
    class LargeService {
      public readonly data = new Uint8Array(MB)
    }

    const before = await memoryInUse()
    const containers = Array.from({ length: 5 }, () => new Container())
    for (const other of containers) {
      await other.get(LargeService)
    }
    expect((await memoryInUse()) - before).toBeGreaterThan(4.5 * MB)

    for (let remaining = 4; remaining >= 0; remaining--) {
      await containers[remaining].dispose()
      const inUse = (await memoryInUse()) - before
      expect(inUse).toBeLessThan((remaining + 0.5) * MB)
      expect(inUse).toBeGreaterThan((remaining - 0.5) * MB)
    }
  })

  it('should reclaim deep dependency chains', async () => {
    @Injectable()
    class Bottom {
      public readonly data = new Uint8Array(MB / 2)
    }

    let Top: new () => object = Bottom
    for (let i = 0; i < 9; i++) {
      const Below = Top

      @Injectable()
      class Level {
        public readonly next = inject(Below)
        public readonly data = new Uint8Array(MB / 2)
      }
      Top = Level
    }

    const before = await memoryInUse()
    await container.get(Top)
    expect((await memoryInUse()) - before).toBeGreaterThan(4.5 * MB)

    await container.dispose()
    container = new Container()
    expect((await memoryInUse()) - before).toBeLessThan(MB / 2)
  })

  it('should not accumulate memory with repeated service invalidation', async () => {
    @Injectable()
    class InvalidatableService implements OnServiceDestroy {
      public readonly data = new Uint8Array(MB / 2)

      onServiceDestroy(): void {
        // Cleanup
      }
    }

    const before = await memoryInUse()
    for (let i = 0; i < 30; i++) {
      await container.invalidate(await container.get(InvalidatableService))
    }
    await container.get(InvalidatableService)

    // Only the last instance is left.
    expect((await memoryInUse()) - before).toBeLessThan(MB)
  })

  it('should handle many request lifecycles without leaking', async () => {
    const services = Array.from({ length: 5 }, () => {
      @Injectable({ scope: InjectableScope.Request })
      class RequestService {
        public readonly data = new Uint8Array(MB / 50)
      }
      return RequestService
    })

    const before = await memoryInUse()
    for (let i = 0; i < 50; i++) {
      const scope = container.createScope()
      for (const service of services) {
        await scope.get(service)
      }
      await scope.dispose()
    }
    expect((await memoryInUse()) - before).toBeLessThan(MB / 2)
  })
})
