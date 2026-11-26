import { beforeEach, describe, expect, it, vi } from 'vitest'

import { RabbitMQClient } from '../brokers/rabbitmq/rabbitmq-client.mjs'
import { rabbitmqConfigSchema } from '../brokers/rabbitmq/rabbitmq-config.mjs'

interface FakeMessage {
  content: Buffer
  properties: { headers?: Record<string, unknown>; correlationId?: string; replyTo?: string }
}

type ConsumeCallback = (msg: FakeMessage | null) => unknown

interface PublishOptions {
  headers?: Record<string, unknown>
  correlationId?: string
  replyTo?: string
}

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
    publish: vi.fn(
      async (_exchange: string, _routingKey: string, _message: unknown, _opts?: PublishOptions) =>
        true,
    ),
    // ChannelWrapper serialises (json: true) and the broker routes to the consumer.
    sendToQueue: vi.fn(async (queue: string, message: unknown, opts?: PublishOptions) => {
      await consumers.get(queue)?.({
        content: Buffer.from(JSON.stringify(message)),
        properties: { headers: opts?.headers ?? {} },
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

const config = rabbitmqConfigSchema.parse({
  type: 'rabbitmq',
  url: 'amqp://localhost:5672',
  prefetch: 7,
})

describe('RabbitMQClient with amqplib 2.x channel API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    consumers.clear()
  })

  it('round-trips a message: send -> consume -> ack', async () => {
    const { connection, wrapper } = installConnectionManager()
    const client = new RabbitMQClient(config)
    await client.connect()

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
    await client.connect()

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

  it('nacks a failed message and sends it again until retry.maxRetries', async () => {
    const { wrapper } = installConnectionManager()
    const client = new RabbitMQClient(config)
    await client.connect()
    const handler = vi.fn(async () => {
      throw new Error('handler failed')
    })

    await client.receive('jobs', handler)
    await client.send('jobs', { id: 1 })

    // The first delivery and three retries, counted in the x-retry-count header
    expect(handler).toHaveBeenCalledTimes(4)
    expect(fakeChannel.nack).toHaveBeenCalledTimes(4)
    expect(fakeChannel.ack).not.toHaveBeenCalled()
    expect(wrapper.sendToQueue.mock.calls.map(([, , opts]) => opts?.headers)).toEqual([
      undefined,
      { 'x-retry-count': 1 },
      { 'x-retry-count': 2 },
      { 'x-retry-count': 3 },
    ])

    await client.disconnect()
  })

  it('publishes a pub/sub retry to the exchange of its topic', async () => {
    const { wrapper } = installConnectionManager()
    const client = new RabbitMQClient(config)
    await client.connect()
    await client.subscribe('events', async () => {
      throw new Error('handler failed')
    })
    const queue = [...consumers.keys()].find((name) => name.startsWith('queue.events.'))!

    await consumers.get(queue)!({ content: Buffer.from('{"id":1}'), properties: {} })

    expect(fakeChannel.nack).toHaveBeenCalledTimes(1)
    expect(wrapper.publish).toHaveBeenCalledWith(
      'exchange.events',
      'events',
      { id: 1 },
      { persistent: true, contentType: 'application/json', headers: { 'x-retry-count': 1 } },
    )

    await client.disconnect()
  })

  it('resolves a request with the reply of the same correlation id', async () => {
    const { wrapper } = installConnectionManager()
    const client = new RabbitMQClient(config)
    await client.connect()

    const response = client.request('users', { id: 1 })
    await vi.waitFor(() => expect(wrapper.publish).toHaveBeenCalled())
    const [exchange, routingKey, message, opts] = wrapper.publish.mock.calls[0]!
    expect([exchange, routingKey, message]).toEqual(['exchange.users', 'users.request', { id: 1 }])

    const replies = consumers.get(opts!.replyTo!)!
    const reply = { content: Buffer.from('{"name":"Ada"}'), properties: {} }
    await replies({ ...reply, properties: { correlationId: 'another' } })
    await replies({ ...reply, properties: { correlationId: opts!.correlationId } })

    await expect(response).resolves.toEqual({ name: 'Ada' })
    expect(fakeChannel.ack).toHaveBeenCalledTimes(2)

    await client.disconnect()
  })

  it('rejects the waiting requests on disconnect', async () => {
    const { wrapper } = installConnectionManager()
    const client = new RabbitMQClient(config)
    await client.connect()

    const response = client.request('users', { id: 1 })
    await vi.waitFor(() => expect(wrapper.publish).toHaveBeenCalled())
    await client.disconnect()

    await expect(response).rejects.toThrow('Connection closed')
  })
})
