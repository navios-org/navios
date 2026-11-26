import type {
  AmqpConnectionManager,
  AmqpConnectionManagerOptions,
  ChannelWrapper,
} from 'amqp-connection-manager'
import type { Channel as AmqplibChannel, ConsumeMessage, Options } from 'amqplib'

import { generateId } from '../generate-id.mjs'
import { PendingRequests } from '../pending-requests.mjs'

import type { QueueClient } from '../../client/queue-client.mjs'

import { loadAmqplib } from './load-amqplib.mjs'

import type { RabbitmqConfig } from './rabbitmq-config.mjs'

/**
 * RabbitMQ queue client adapter.
 * Implements QueueClient interface for RabbitMQ message broker.
 * Uses amqp-connection-manager for automatic reconnection.
 */
export class RabbitMQClient implements QueueClient {
  private connection: AmqpConnectionManager | null = null
  private channel: ChannelWrapper | null = null
  private replyQueue: string | null = null
  private pendingRequests = new PendingRequests()

  constructor(private config: RabbitmqConfig) {}

  /** Opens the connection and its channel. `QueueClientFactory` calls it before it hands the client out. */
  async connect(): Promise<void> {
    const amqp = await loadAmqplib()

    // Build TLS options if enabled
    const tlsOptions = this.config.tls?.enabled
      ? {
          rejectUnauthorized: this.config.tls.rejectUnauthorized,
          ca: this.config.tls.ca ? [this.config.tls.ca] : undefined,
          cert: this.config.tls.cert,
          key: this.config.tls.key,
          passphrase: this.config.tls.passphrase,
        }
      : undefined

    // Build connection URL with vhost
    const url = new URL(this.config.url)
    if (this.config.vhost && this.config.vhost !== '/') {
      url.pathname = encodeURIComponent(this.config.vhost)
    }

    // Build connection options
    const connectionOptions: AmqpConnectionManagerOptions['connectionOptions'] = {
      timeout: this.config.connectionOptions.timeout,
      keepAlive: this.config.connectionOptions.keepAlive,
      keepAliveDelay: this.config.connectionOptions.keepAliveDelay,
      noDelay: this.config.connectionOptions.noDelay,
    }

    if (this.config.connectionOptions.clientProperties) {
      connectionOptions.clientProperties = this.config.connectionOptions.clientProperties
    }

    if (tlsOptions) {
      Object.assign(connectionOptions, tlsOptions)
    }

    this.connection = amqp.connect([url.toString()], {
      heartbeatIntervalInSeconds: this.config.heartbeatIntervalInSeconds,
      reconnectTimeInSeconds: this.config.reconnectTimeInSeconds,
      connectionOptions,
    })

    this.connection.on('connect', () => {
      // Connected
    })

    this.connection.on('disconnect', () => {
      // Disconnected - will auto-reconnect
    })

    const { prefetch } = this.config

    this.channel = this.connection.createChannel({
      json: true,
      setup: async (channel: AmqplibChannel) => {
        await channel.prefetch(prefetch)
      },
    })

    await this.channel.waitForConnect()
  }

  private getExchangeName(topic: string): string {
    return `exchange.${topic}`
  }

  private async ensureExchange(exchangeName: string): Promise<void> {
    if (!this.channel) {
      throw new Error('RabbitMQ channel not initialized')
    }

    const { type: exchangeType, durable, autoDelete } = this.config.exchange

    await this.channel.addSetup(async (channel: AmqplibChannel) => {
      await channel.assertExchange(exchangeName, exchangeType, {
        durable,
        autoDelete,
      })
    })
  }

  private async ensureQueue(queueName: string): Promise<void> {
    if (!this.channel) {
      throw new Error('RabbitMQ channel not initialized')
    }

    const { durable, autoDelete, exclusive, messageTtl, maxLength, maxPriority } = this.config.queue

    const args: Record<string, unknown> = {}
    if (messageTtl) {
      args['x-message-ttl'] = messageTtl
    }
    if (maxLength) {
      args['x-max-length'] = maxLength
    }
    if (maxPriority) {
      args['x-max-priority'] = maxPriority
    }
    if (this.config.deadLetter?.enabled && this.config.deadLetter.exchange) {
      args['x-dead-letter-exchange'] = this.config.deadLetter.exchange
      if (this.config.deadLetter.queue) {
        args['x-dead-letter-routing-key'] = this.config.deadLetter.queue
      }
    }

    await this.channel.addSetup(async (channel: AmqplibChannel) => {
      await channel.assertQueue(queueName, {
        durable,
        autoDelete,
        exclusive,
        arguments: Object.keys(args).length > 0 ? args : undefined,
      })
    })
  }

  async publish(topic: string, message: unknown): Promise<void> {
    if (!this.channel) {
      throw new Error('RabbitMQ channel not initialized')
    }

    const exchangeName = this.getExchangeName(topic)
    await this.ensureExchange(exchangeName)

    await this.channel.publish(exchangeName, topic, message, {
      persistent: true,
      contentType: 'application/json',
    })
  }

  async subscribe(topic: string, handler: (message: unknown) => Promise<void>): Promise<void> {
    if (!this.channel) {
      throw new Error('RabbitMQ channel not initialized')
    }

    const exchangeName = this.getExchangeName(topic)
    const queueName = `queue.${topic}.${generateId()}`

    await this.ensureExchange(exchangeName)

    await this.channel.addSetup(async (channel: AmqplibChannel) => {
      await channel.assertQueue(queueName, {
        exclusive: true,
        autoDelete: true,
      })
      await channel.bindQueue(queueName, exchangeName, topic)

      await this.consumeWithRetry(channel, queueName, handler, (content, options) =>
        this.channel?.publish(exchangeName, topic, content, options),
      )
    })
  }

  async send(queue: string, message: unknown): Promise<void> {
    if (!this.channel) {
      throw new Error('RabbitMQ channel not initialized')
    }

    await this.ensureQueue(queue)

    await this.channel.sendToQueue(queue, message, {
      persistent: true,
      contentType: 'application/json',
    })
  }

  async receive(queue: string, handler: (message: unknown) => Promise<void>): Promise<void> {
    if (!this.channel) {
      throw new Error('RabbitMQ channel not initialized')
    }

    await this.ensureQueue(queue)

    await this.channel.addSetup(async (channel: AmqplibChannel) => {
      await this.consumeWithRetry(channel, queue, handler, (content, options) =>
        this.channel?.sendToQueue(queue, content, options),
      )
    })
  }

  /**
   * Consumes `queue` with `handler`. A message the handler accepts is acked. A
   * failed one is nacked and, until `retry.maxRetries` is reached, handed to
   * `resend` with its `x-retry-count` header incremented.
   */
  private async consumeWithRetry(
    channel: AmqplibChannel,
    queue: string,
    handler: (message: unknown) => Promise<void>,
    resend: (content: unknown, options: Options.Publish) => Promise<unknown> | undefined,
  ): Promise<void> {
    await channel.consume(
      queue,
      async (msg: ConsumeMessage | null) => {
        if (!msg) return

        try {
          await handler(JSON.parse(msg.content.toString()))
          channel.ack(msg)
        } catch {
          channel.nack(msg, false, false)

          const retryCount = (msg.properties.headers?.['x-retry-count'] ?? 0) as number
          if (retryCount < this.config.retry.maxRetries) {
            await resend(JSON.parse(msg.content.toString()), {
              persistent: true,
              contentType: 'application/json',
              headers: { ...msg.properties.headers, 'x-retry-count': retryCount + 1 },
            })
          }
        }
      },
      { noAck: false },
    )
  }

  async request(topic: string, message: unknown): Promise<unknown> {
    if (!this.channel) {
      throw new Error('RabbitMQ channel not initialized')
    }

    // Set up reply queue if not exists
    if (!this.replyQueue) {
      await this.setupReplyQueue()
    }

    const correlationId = generateId()
    const exchangeName = this.getExchangeName(topic)

    await this.ensureExchange(exchangeName)

    const reply = this.pendingRequests.create(correlationId, `topic: ${topic}`)

    this.channel
      .publish(exchangeName, `${topic}.request`, message, {
        persistent: true,
        contentType: 'application/json',
        correlationId,
        replyTo: this.replyQueue!,
      })
      .catch((error: unknown) => this.pendingRequests.fail(correlationId, error))

    return reply
  }

  private async setupReplyQueue(): Promise<void> {
    if (!this.channel) {
      throw new Error('RabbitMQ channel not initialized')
    }

    const replyQueueName = `reply.${generateId()}`

    await this.channel.addSetup(async (channel: AmqplibChannel) => {
      const { queue } = await channel.assertQueue(replyQueueName, {
        exclusive: true,
        autoDelete: true,
      })
      this.replyQueue = queue

      await channel.consume(
        queue,
        (msg: ConsumeMessage | null) => {
          if (!msg) return

          const { correlationId } = msg.properties
          if (correlationId) {
            this.pendingRequests.settle(correlationId, msg.content.toString())
          }

          channel.ack(msg)
        },
        { noAck: false },
      )
    })
  }

  async reply(topic: string, handler: (message: unknown) => Promise<unknown>): Promise<void> {
    if (!this.channel) {
      throw new Error('RabbitMQ channel not initialized')
    }

    const exchangeName = this.getExchangeName(topic)
    const queueName = `queue.${topic}.request.${generateId()}`

    await this.ensureExchange(exchangeName)

    await this.channel.addSetup(async (channel: AmqplibChannel) => {
      await channel.assertQueue(queueName, {
        exclusive: true,
        autoDelete: true,
      })
      await channel.bindQueue(queueName, exchangeName, `${topic}.request`)

      await channel.consume(
        queueName,
        async (msg: ConsumeMessage | null) => {
          if (!msg) return

          try {
            const content = JSON.parse(msg.content.toString())
            const response = await handler(content)

            if (msg.properties.replyTo) {
              channel.sendToQueue(msg.properties.replyTo, Buffer.from(JSON.stringify(response)), {
                correlationId: msg.properties.correlationId,
                contentType: 'application/json',
              })
            }

            channel.ack(msg)
          } catch {
            channel.nack(msg, false, false)
          }
        },
        { noAck: false },
      )
    })
  }

  async disconnect(): Promise<void> {
    this.pendingRequests.rejectAll()

    // Close channel
    if (this.channel) {
      await this.channel.close()
      this.channel = null
    }

    // Close connection
    if (this.connection) {
      await this.connection.close()
      this.connection = null
    }

    this.replyQueue = null
  }
}
