import { beforeEach, describe, expect, it, vi } from 'vitest'

import { RabbitMQClient } from '../adapters/rabbitmq.adapter.mjs'

import type { RabbitmqConfig } from '../types/queue-config.mjs'

interface FakeMessage {
  content: Buffer
  properties: { headers?: Record<string, unknown>; correlationId?: string; replyTo?: string }
}

type ConsumeCallback = (msg: FakeMessage | null) => unknown

const consumers = new Map<string, ConsumeCallback>()

// Minimal in-memory stand-in for the amqplib 2.x promise-based Channel.
const fakeChannel = {
  prefetch: vi.fn(async (_count: number) => {}),
  assertExchange: vi.fn(async (_name: string, _type: string, _opts?: unknown) => ({})),
  assertQueue: vi.fn(async (name: string, _opts?: unknown) => ({
    queue: name,
    messageCount: 0,
    consumerCount: 0,
  })),
  bindQueue: vi.fn(async (_q: string, _e: string, _rk: string) => ({})),
  consume: vi.fn(async (queue: string, cb: ConsumeCallback, _opts?: unknown) => {
    consumers.set(queue, cb)
    return { consumerTag: `tag-${queue}` }
  }),
  ack: vi.fn((_msg: FakeMessage) => {}),
  nack: vi.fn((_msg: FakeMessage, _all?: boolean, _requeue?: boolean) => {}),
}

const connectMock = vi.fn()

vi.mock('amqp-connection-manager', () => ({
  connect: (...args: unknown[]) => connectMock(...args),
}))

function installConnectionManager() {
  const wrapper = {
    waitForConnect: vi.fn(async () => {}),
    addSetup: vi.fn(async (fn: (ch: unknown) => Promise<void>) => {
      await fn(fakeChannel)
    }),
    publish: vi.fn(async () => true),
    // ChannelWrapper serialises (json: true) and the broker routes to the consumer.
    sendToQueue: vi.fn(async (queue: string, message: unknown, _opts?: unknown) => {
      await consumers.get(queue)?.({
        content: Buffer.from(JSON.stringify(message)),
        properties: { headers: {} },
      })
      return true
    }),
    close: vi.fn(async () => {}),
  }
  const connection = {
    on: vi.fn(),
    createChannel: vi.fn((opts: { setup: (ch: unknown) => Promise<void> }) => {
      void opts.setup(fakeChannel)
      return wrapper
    }),
    close: vi.fn(async () => {}),
  }
  connectMock.mockReturnValue(connection)
  return { connection, wrapper }
}

const config = {
  type: 'rabbitmq',
  url: 'amqp://localhost:5672',
  vhost: '/',
  heartbeatIntervalInSeconds: 5,
  prefetch: 7,
} as RabbitmqConfig

describe('RabbitMQClient with amqplib 2.x channel API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    consumers.clear()
  })

  it('round-trips a message: send -> consume -> ack', async () => {
    const { connection, wrapper } = installConnectionManager()
    const client = new RabbitMQClient(config)
    await client.onServiceInit()

    expect(connectMock).toHaveBeenCalledTimes(1)
    expect(connectMock.mock.calls[0]![0]).toEqual(['amqp://localhost:5672'])
    expect(connection.createChannel).toHaveBeenCalledTimes(1)
    expect(fakeChannel.prefetch).toHaveBeenCalledWith(7)

    const received: unknown[] = []
    await client.receive('jobs', async (msg) => {
      received.push(msg)
    })

    expect(fakeChannel.assertQueue).toHaveBeenCalledWith('jobs', {
      durable: true,
      autoDelete: false,
      exclusive: false,
      arguments: undefined,
    })
    expect(fakeChannel.consume).toHaveBeenCalledWith('jobs', expect.any(Function), {
      noAck: false,
    })

    await client.send('jobs', { id: 1 })

    expect(wrapper.sendToQueue).toHaveBeenCalledWith(
      'jobs',
      { id: 1 },
      { persistent: true, contentType: 'application/json' },
    )
    expect(received).toEqual([{ id: 1 }])
    expect(fakeChannel.ack).toHaveBeenCalledTimes(1)
    expect(fakeChannel.ack.mock.calls[0]![0].content.toString()).toBe('{"id":1}')
    expect(fakeChannel.nack).not.toHaveBeenCalled()

    await client.disconnect()
    expect(wrapper.close).toHaveBeenCalled()
    expect(connection.close).toHaveBeenCalled()
  })

  it('publishes to an exchange and binds a subscriber queue', async () => {
    const { wrapper } = installConnectionManager()
    const client = new RabbitMQClient(config)
    await client.onServiceInit()

    await client.subscribe('events', async () => {})
    await client.publish('events', { hello: 'world' })

    expect(fakeChannel.assertExchange).toHaveBeenCalledWith('exchange.events', 'topic', {
      durable: true,
      autoDelete: false,
    })
    expect(fakeChannel.bindQueue).toHaveBeenCalledWith(
      expect.stringMatching(/^queue\.events\./),
      'exchange.events',
      'events',
    )
    expect(fakeChannel.consume).toHaveBeenCalledWith(
      expect.stringMatching(/^queue\.events\./),
      expect.any(Function),
      { noAck: false },
    )
    expect(wrapper.publish).toHaveBeenCalledWith(
      'exchange.events',
      'events',
      { hello: 'world' },
      { persistent: true, contentType: 'application/json' },
    )

    await client.disconnect()
  })
})
