import { Container, Factory, globalRegistry, InjectableScope, Registry } from '@navios/di'
import { z } from 'zod/v4'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { QueuePublisher, QueuePublisherToken } from '../services/queue-publisher.service.mjs'
import { QueueClientToken } from '../tokens/queue-client.token.mjs'

import type { FactoryContext } from '@navios/di'
import type { QueueClient } from '../interfaces/queue-client.mjs'

/**
 * Keystone regression test for the canonical @InjectDerived reference case
 * (commit 630fec9, queues di-v2 migration).
 *
 * The three `queue-{publisher,requester,sender}` services each carry:
 *
 *   @InjectDerived(QueueClientToken, (hostArgs) => ({ name: hostArgs.name }))
 *   private accessor queueClient!: QueueClient
 *
 * which must faithfully reproduce the v1 in-constructor
 * `this.queueClient = inject(QueueClientToken, { name })`. di v2 resolves the
 * host's schema-validated args, runs `derive(hostArgs)`, then
 * `ctx.inject(QueueClientToken, deriveResult)`. Because `QueueClientToken` is
 * registered at `InjectableScope.Singleton`, the resolved client is memoized
 * per distinct `name` (di keys the instance name by token+scope+args-hash):
 * the SAME `name` yields a SHARED client; a DIFFERENT `name` yields a DISTINCT
 * client. This is the v1->v2 behavioral-equivalence invariant we lock here.
 *
 * Broker-free wiring: the real `QueueClientFactory` switches on
 * rabbitmq/kafka/sqs and would open real broker connections. Instead we
 * register our OWN `@Factory({ token: QueueClientToken })` into a child
 * `Registry` (parented to globalRegistry, so the real `@Injectable`
 * `QueuePublisher` registration is still visible). The child registry's
 * `get(QueueClientToken)` resolves to OUR stub factory (the parent's real
 * `QueueClientFactory` is shadowed for that token only). This genuinely
 * exercises the @InjectDerived -> `ctx.inject(QueueClientToken, { name })`
 * resolution path: di still validates host args, runs the derive callback,
 * and resolves `QueueClientToken` with the derived `{ name }` through the
 * factory's `create(ctx, { name })`. Per-`name` singleton memoization is
 * provided by di itself (Singleton scope keyed by resolution args) -- exactly
 * the mechanism the real factory relies on -- so the invariant under test is
 * the real one, not a hollow mock that bypasses the derive.
 */
describe('@InjectDerived keystone: QueueClient per-name lifetime', () => {
  let registry: Registry
  let container: Container

  // Minimal, broker-free QueueClient stub. Each instance is identity-distinct
  // so we can assert sharing/distinctness purely by reference.
  class StubQueueClient implements QueueClient {
    constructor(public readonly name: string) {}
    async publish(): Promise<void> {}
    async subscribe(): Promise<void> {}
    async send(): Promise<void> {}
    async receive(): Promise<void> {}
    async request(): Promise<unknown> {
      return undefined
    }
    async reply(): Promise<void> {}
    async disconnect(): Promise<void> {}
  }

  beforeEach(() => {
    // Child of globalRegistry (the registry the @Injectable / @Factory
    // decorators wrote into at module-import time). Keeps the real
    // @Injectable QueuePublisher registration visible while letting us
    // shadow QueueClientToken with a broker-free stub factory below.
    registry = new Registry(globalRegistry)
    container = new Container({ registry })

    // Stub QueueClient factory keyed by derived `name`. Singleton scope (the
    // same scope the real QueueClientFactory uses) so di memoizes one client
    // per distinct `name` across all hosts that derive that name.
    @Factory({
      token: QueueClientToken,
      registry,
      scope: InjectableScope.Singleton,
      priority: 1000,
    })
    class StubQueueClientFactory {
      create(
        _ctx: FactoryContext,
        { name }: { name: string } = { name: 'default' },
      ): QueueClient {
        return new StubQueueClient(name)
      }
    }
    void StubQueueClientFactory
  })

  afterEach(async () => {
    await container.dispose()
  })

  const pubsubDef = (topic: string) => ({
    pattern: 'pubsub' as const,
    topic,
    payloadSchema: z.object({ value: z.string() }),
  })

  const getClient = (publisher: QueuePublisher<any>): QueueClient =>
    (publisher as unknown as { queueClient: QueueClient }).queueClient

  it('same `name` => shared QueueClient; different `name` => distinct QueueClient', async () => {
    // Resolve a QueuePublisher with `name: 'shared'`. di validates the host
    // args against queuePublisherOptionsSchema, runs the @InjectDerived
    // callback `(hostArgs) => ({ name: hostArgs.name })`, then resolves
    // QueueClientToken via `ctx.inject(QueueClientToken, { name: 'shared' })`.
    const pubShared = await container.get(QueuePublisherToken, {
      messageDef: pubsubDef('topic.shared'),
      name: 'shared',
    })
    const pubOther = await container.get(QueuePublisherToken, {
      messageDef: pubsubDef('topic.other'),
      name: 'other',
    })

    const derivedSharedClient = getClient(pubShared)
    const derivedOtherClient = getClient(pubOther)

    // (c) @InjectDerived actually resolved: the accessor is populated/usable
    // (not the `!`-asserted undefined) by the time we can read it.
    expect(derivedSharedClient).toBeInstanceOf(StubQueueClient)
    expect(derivedOtherClient).toBeInstanceOf(StubQueueClient)

    // Independently resolve QueueClientToken directly with the SAME derived
    // args the host's @InjectDerived would have produced. This is exactly the
    // `ctx.inject(QueueClientToken, { name })` call the decorator makes.
    // Because QueueClientToken is registered Singleton, di memoizes one
    // instance per distinct `name` (instance name keyed by token+scope+args
    // hash) and returns the SAME object the publisher received.
    const directSharedClient = await container.get(QueueClientToken, { name: 'shared' })
    const directOtherClient = await container.get(QueueClientToken, { name: 'other' })

    // (a) same `name` => SHARED client: the publisher's @InjectDerived field
    // is the very same instance as a direct per-name resolution (v1's
    // `inject(QueueClientToken, { name })` shared-per-name behavior).
    expect(derivedSharedClient).toBe(directSharedClient)
    expect((derivedSharedClient as StubQueueClient).name).toBe('shared')

    // (b) different `name` => DISTINCT client: the 'other' publisher's
    // derived client is its own per-name instance, never the 'shared' one.
    expect(derivedOtherClient).toBe(directOtherClient)
    expect(derivedOtherClient).not.toBe(derivedSharedClient)
    expect(directOtherClient).not.toBe(directSharedClient)
    expect((derivedOtherClient as StubQueueClient).name).toBe('other')
  })
})
