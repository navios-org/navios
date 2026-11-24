import { Container, DIErrorCode, InjectionToken, provide } from '@navios/di'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod/v4'

import {
  messageBuilder,
  QueueClientToken,
  QueueConfigServiceToken,
  QueuePublisherToken,
  QueueRequesterToken,
  QueueSenderToken,
  RabbitMQClient,
} from '../index.mjs'

import type { QueueClient, QueueConfig, QueueConfigService, QueuePublisher } from '../index.mjs'

const wrapper = {
  waitForConnect: vi.fn(async () => {}),
  addSetup: vi.fn(async () => {}),
  publish: vi.fn(async () => true),
  sendToQueue: vi.fn(async () => true),
  close: vi.fn(async () => {}),
}
const connection = {
  on: vi.fn(),
  createChannel: vi.fn(() => wrapper),
  close: vi.fn(async () => {}),
}
const connectMock = vi.fn((..._args: unknown[]) => connection)

vi.mock('amqp-connection-manager', () => ({
  connect: (...args: unknown[]) => connectMock(...args),
}))

const rabbit = (url: string) =>
  ({
    type: 'rabbitmq',
    url,
    vhost: '/',
    heartbeatIntervalInSeconds: 5,
    prefetch: 10,
  }) as const

class TestConfigService implements QueueConfigService {
  getConfig(): QueueConfig {
    return {
      default: rabbit('amqp://default:5672'),
      audit: rabbit('amqp://audit:5672'),
    } as QueueConfig
  }
}

describe('queues with @navios/di', () => {
  let container: Container

  beforeEach(() => {
    vi.clearAllMocks()
    container = new Container({
      providers: [provide(QueueConfigServiceToken, TestConfigService)],
    })
  })

  afterEach(async () => {
    await container.dispose()
  })

  describe('QueueConfigServiceToken', () => {
    it('should fail with a helpful message when no config service is provided', async () => {
      const bare = new Container()
      try {
        await expect(bare.get(QueueClientToken)).rejects.toThrow(
          /QueueConfigService not provided.*provide\(QueueConfigServiceToken/,
        )
      } finally {
        await bare.dispose()
      }
    })

    it('should use the config service bound with provide()', async () => {
      const config = await container.get(QueueConfigServiceToken)

      expect(config).toBeInstanceOf(TestConfigService)
    })

    it('should accept container.provide() before the first resolution', async () => {
      const late = new Container()
      late.provide(QueueConfigServiceToken, TestConfigService)
      try {
        expect(await late.get(QueueClientToken)).toBeInstanceOf(RabbitMQClient)
      } finally {
        await late.dispose()
      }
    })
  })

  describe('QueueClientToken', () => {
    it('should create and connect the default client once', async () => {
      const init = vi.spyOn(RabbitMQClient.prototype, 'onServiceInit')

      const first = await container.get(QueueClientToken)
      const second = await container.get(QueueClientToken)

      expect(first).toBeInstanceOf(RabbitMQClient)
      expect(second).toBe(first)
      expect(init).toHaveBeenCalledTimes(1)
      expect(connectMock).toHaveBeenCalledTimes(1)
      expect(connectMock.mock.calls[0][0]).toEqual(['amqp://default:5672'])
    })

    it('should treat a missing name as the default client', async () => {
      const implicit = await container.get(QueueClientToken)
      const explicit = await container.get(QueueClientToken, { name: 'default' })

      expect(explicit).toBe(implicit)
    })

    it('should create one client per configured name', async () => {
      const first = await container.get(QueueClientToken, { name: 'default' })
      const audit = await container.get(QueueClientToken, { name: 'audit' })

      expect(audit).not.toBe(first)
      expect(connectMock).toHaveBeenCalledTimes(2)
      expect(connectMock.mock.calls[1][0]).toEqual(['amqp://audit:5672'])
    })

    it('should reject a name that is not in the configuration', async () => {
      await expect(container.get(QueueClientToken, { name: 'missing' })).rejects.toThrow(
        'Queue missing not found in config',
      )
    })

    it('should disconnect the client once when the container is disposed', async () => {
      const destroy = vi.spyOn(RabbitMQClient.prototype, 'onServiceDestroy')
      const local = new Container({
        providers: [provide(QueueConfigServiceToken, TestConfigService)],
      })
      await local.get(QueueClientToken)

      await local.dispose()

      expect(destroy).toHaveBeenCalledTimes(1)
      expect(connection.close).toHaveBeenCalledTimes(1)
    })

    it('should disconnect an invalidated client and connect a new one', async () => {
      const first = await container.get(QueueClientToken)

      await container.invalidate(first)
      expect(connection.close).toHaveBeenCalledTimes(1)

      const second = await container.get(QueueClientToken)
      expect(second).not.toBe(first)
      expect(connectMock).toHaveBeenCalledTimes(2)
    })

    it('should let provide() replace the client', async () => {
      const fake = { publish: vi.fn(async () => {}) } as unknown as QueueClient
      const local = new Container({ providers: [provide(QueueClientToken, { value: fake })] })
      try {
        expect(await local.get(QueueClientToken, { name: 'default' })).toBe(fake)
        expect(connectMock).not.toHaveBeenCalled()
      } finally {
        await local.dispose()
      }
    })
  })

  describe('publisher, sender and requester', () => {
    const builder = messageBuilder()
    const userCreated = builder.declarePubSub({
      topic: 'user.created',
      payloadSchema: z.object({ id: z.string() }),
    })
    const sendEmail = builder.declarePointToPoint({
      queue: 'emails',
      payloadSchema: z.object({ to: z.string() }),
    })
    const getUser = builder.declareRequestReply({
      topic: 'user.get',
      payloadSchema: z.object({ id: z.string() }),
      responseSchema: z.object({ name: z.string() }),
    })

    let client: {
      publish: ReturnType<typeof vi.fn>
      send: ReturnType<typeof vi.fn>
      request: ReturnType<typeof vi.fn>
    }

    beforeEach(() => {
      client = {
        publish: vi.fn(async () => {}),
        send: vi.fn(async () => {}),
        request: vi.fn(async () => ({ name: 'Ada', extra: true })),
      }
      container = new Container({
        providers: [provide(QueueClientToken, { value: client as unknown as QueueClient })],
      })
    })

    it('should publish a validated payload to the topic', async () => {
      const publisher = await container.get(QueuePublisherToken, { messageDef: userCreated })

      await publisher.publish({ id: '1' })

      expect(client.publish).toHaveBeenCalledWith('user.created', { id: '1' })
    })

    it('should reject an invalid payload before publishing', async () => {
      const publisher = await container.get(QueuePublisherToken, { messageDef: userCreated })

      await expect(publisher.publish({ id: 1 })).rejects.toThrow()
      expect(client.publish).not.toHaveBeenCalled()
    })

    it('should send a validated payload to the queue', async () => {
      const sender = await container.get(QueueSenderToken, { messageDef: sendEmail })

      await sender.send({ to: 'ada@example.com' })

      expect(client.send).toHaveBeenCalledWith('emails', { to: 'ada@example.com' })
    })

    it('should send a request and validate the response', async () => {
      const requester = await container.get(QueueRequesterToken, { messageDef: getUser })

      const response = await requester.request({ id: '1' })

      expect(client.request).toHaveBeenCalledWith('user.get', { id: '1' })
      expect(response).toEqual({ name: 'Ada' })
    })

    it('should reject a message definition of another pattern', async () => {
      await expect(
        container.get(QueuePublisherToken, { messageDef: sendEmail as never }),
      ).rejects.toMatchObject({ code: DIErrorCode.TokenValidationError })
    })

    it('should resolve a bound publisher token', async () => {
      const UserCreatedPublisher = InjectionToken.refineType<QueuePublisher<typeof userCreated>>(
        InjectionToken.bound(QueuePublisherToken, { messageDef: userCreated }),
      )

      const publisher = await container.get(UserCreatedPublisher)
      await publisher.publish({ id: '2' })
      // @ts-expect-error the payload type comes from the declaration
      await expect(publisher.publish({ id: 2 })).rejects.toThrow()

      expect(client.publish).toHaveBeenCalledWith('user.created', { id: '2' })
    })
  })
})
