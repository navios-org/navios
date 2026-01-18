import type { OnServiceDestroy, OnServiceInit } from '@navios/di'

import type { QueueClient } from '../interfaces/queue-client.mjs'
import type { KafkaConfig } from '../types/queue-config.mjs'

type KafkaJS = typeof import('kafkajs')
type KafkaInstance = import('kafkajs').Kafka
type Producer = import('kafkajs').Producer
type Consumer = import('kafkajs').Consumer
type EachMessagePayload = import('kafkajs').EachMessagePayload

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
  timeout: ReturnType<typeof setTimeout>
}

/**
 * Kafka queue client adapter.
 * Implements QueueClient interface for Apache Kafka.
 * Uses kafkajs for connection management.
 */
export class KafkaClient implements QueueClient, OnServiceInit, OnServiceDestroy {
  private kafka: KafkaInstance | null = null
  private producer: Producer | null = null
  private consumer: Consumer | null = null
  private replyConsumer: Consumer | null = null
  private replyTopic: string | null = null
  private pendingRequests = new Map<string, PendingRequest>()
  private subscriptions = new Map<string, (message: unknown) => Promise<void>>()
  private isConsumerRunning = false

  constructor(private config: KafkaConfig) {}

  async onServiceInit(): Promise<void> {
    const kafkajs = await this.loadKafkaJS()

    const ssl =
      this.config.ssl === true
        ? true
        : this.config.ssl
          ? {
              rejectUnauthorized: this.config.ssl.rejectUnauthorized ?? true,
              ca: this.config.ssl.ca ? [this.config.ssl.ca] : undefined,
              cert: this.config.ssl.cert,
              key: this.config.ssl.key,
            }
          : undefined

    const sasl = this.config.sasl ? this.buildSaslConfig(this.config.sasl) : undefined

    this.kafka = new kafkajs.Kafka({
      clientId: this.config.clientId ?? 'navios-queue-client',
      brokers: this.config.brokers,
      connectionTimeout: this.config.connectionTimeout ?? 30000,
      requestTimeout: this.config.requestTimeout ?? 30000,
      ssl,
      sasl,
      retry: this.config.retry
        ? {
            maxRetryTime: this.config.retry.maxRetryTime ?? 30000,
            initialRetryTime: this.config.retry.initialRetryTime ?? 300,
            factor: this.config.retry.factor ?? 0.2,
            multiplier: this.config.retry.multiplier ?? 2,
            retries: this.config.retry.retries ?? 5,
          }
        : undefined,
    })

    // Initialize producer
    this.producer = this.kafka.producer(
      this.config.producer
        ? {
            allowAutoTopicCreation: true,
            transactionTimeout: this.config.producer.timeout ?? 30000,
            idempotent: this.config.producer.idempotent ?? false,
            transactionalId: this.config.producer.transactionalId,
            maxInFlightRequests: this.config.producer.maxInFlightRequests ?? 5,
          }
        : undefined,
    )

    await this.producer.connect()
  }

  async onServiceDestroy(): Promise<void> {
    await this.disconnect()
  }

  private async loadKafkaJS(): Promise<KafkaJS> {
    try {
      return await import('kafkajs')
    } catch {
      throw new Error('kafkajs is not installed. Please install it with: npm install kafkajs')
    }
  }

  private buildSaslConfig(sasl: NonNullable<KafkaConfig['sasl']>): import('kafkajs').SASLOptions {
    switch (sasl.mechanism) {
      case 'plain':
        return {
          mechanism: 'plain',
          username: sasl.username,
          password: sasl.password,
        }
      case 'scram-sha-256':
        return {
          mechanism: 'scram-sha-256',
          username: sasl.username,
          password: sasl.password,
        }
      case 'scram-sha-512':
        return {
          mechanism: 'scram-sha-512',
          username: sasl.username,
          password: sasl.password,
        }
      case 'aws':
        return {
          mechanism: 'aws',
          authorizationIdentity: sasl.authorizationIdentity ?? '',
          accessKeyId: sasl.accessKeyId ?? '',
          secretAccessKey: sasl.secretAccessKey ?? '',
          sessionToken: sasl.sessionToken,
        }
    }
  }

  private async ensureConsumer(): Promise<Consumer> {
    if (!this.kafka) {
      throw new Error('Kafka client not initialized')
    }

    if (!this.consumer) {
      const groupId = this.config.consumer?.groupId ?? `navios-consumer-${this.generateId()}`

      this.consumer = this.kafka.consumer({
        groupId,
        sessionTimeout: this.config.consumer?.sessionTimeout ?? 30000,
        rebalanceTimeout: this.config.consumer?.rebalanceTimeout ?? 60000,
        heartbeatInterval: this.config.consumer?.heartbeatInterval ?? 3000,
        maxBytesPerPartition: this.config.consumer?.maxBytesPerPartition ?? 1048576,
        minBytes: this.config.consumer?.minBytes ?? 1,
        maxBytes: this.config.consumer?.maxBytes ?? 10485760,
        maxWaitTimeInMs: this.config.consumer?.maxWaitTimeInMs ?? 5000,
        allowAutoTopicCreation: this.config.consumer?.allowAutoTopicCreation ?? true,
      })

      await this.consumer.connect()
    }

    return this.consumer
  }

  private async startConsumer(): Promise<void> {
    if (this.isConsumerRunning || !this.consumer) return

    this.isConsumerRunning = true

    await this.consumer.run({
      eachMessage: async ({ topic, message }: EachMessagePayload) => {
        const handler = this.subscriptions.get(topic)
        if (handler && message.value) {
          try {
            const content = JSON.parse(message.value.toString())
            await handler(content)
          } catch {
            // Message processing failed
          }
        }
      },
    })
  }

  async publish(topic: string, message: unknown): Promise<void> {
    if (!this.producer) {
      throw new Error('Kafka producer not initialized')
    }

    const compression = this.getCompressionType()

    await this.producer.send({
      topic,
      compression,
      messages: [
        {
          value: JSON.stringify(message),
          timestamp: Date.now().toString(),
        },
      ],
    })
  }

  async subscribe(topic: string, handler: (message: unknown) => Promise<void>): Promise<void> {
    const consumer = await this.ensureConsumer()

    await consumer.subscribe({
      topic,
      fromBeginning: this.config.consumer?.fromBeginning ?? false,
    })

    this.subscriptions.set(topic, handler)
    await this.startConsumer()
  }

  async send(queue: string, message: unknown): Promise<void> {
    // In Kafka, queues are implemented as topics with a single partition
    // for point-to-point messaging
    await this.publish(queue, message)
  }

  async receive(queue: string, handler: (message: unknown) => Promise<void>): Promise<void> {
    // In Kafka, point-to-point is achieved by having a single consumer group
    await this.subscribe(queue, handler)
  }

  async request(topic: string, message: unknown): Promise<unknown> {
    if (!this.producer || !this.kafka) {
      throw new Error('Kafka client not initialized')
    }

    // Set up reply consumer if not exists
    if (!this.replyConsumer) {
      await this.setupReplyConsumer()
    }

    const correlationId = this.generateId()
    const requestTopic = `${topic}.request`

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(correlationId)
        reject(new Error(`Request timeout for topic: ${topic}`))
      }, 30000)

      this.pendingRequests.set(correlationId, { resolve, reject, timeout })

      this.producer!.send({
        topic: requestTopic,
        messages: [
          {
            value: JSON.stringify(message),
            headers: {
              correlationId,
              replyTo: this.replyTopic!,
            },
            timestamp: Date.now().toString(),
          },
        ],
      }).catch((error: unknown) => {
        clearTimeout(timeout)
        this.pendingRequests.delete(correlationId)
        reject(error)
      })
    })
  }

  private async setupReplyConsumer(): Promise<void> {
    if (!this.kafka) {
      throw new Error('Kafka client not initialized')
    }

    this.replyTopic = `reply.${this.generateId()}`
    const replyGroupId = `reply-consumer-${this.generateId()}`

    this.replyConsumer = this.kafka.consumer({
      groupId: replyGroupId,
    })

    await this.replyConsumer.connect()
    await this.replyConsumer.subscribe({
      topic: this.replyTopic,
      fromBeginning: false,
    })

    await this.replyConsumer.run({
      eachMessage: async ({ message }: EachMessagePayload) => {
        const correlationId = message.headers?.correlationId?.toString()
        if (!correlationId) return

        const pending = this.pendingRequests.get(correlationId)
        if (pending && message.value) {
          clearTimeout(pending.timeout)
          this.pendingRequests.delete(correlationId)

          try {
            const content = JSON.parse(message.value.toString())
            pending.resolve(content)
          } catch (err) {
            pending.reject(err)
          }
        }
      },
    })
  }

  async reply(topic: string, handler: (message: unknown) => Promise<unknown>): Promise<void> {
    if (!this.producer || !this.kafka) {
      throw new Error('Kafka client not initialized')
    }

    const requestTopic = `${topic}.request`
    const replyGroupId = `reply-handler-${this.generateId()}`

    const replyHandler = this.kafka.consumer({
      groupId: replyGroupId,
    })

    await replyHandler.connect()
    await replyHandler.subscribe({
      topic: requestTopic,
      fromBeginning: false,
    })

    await replyHandler.run({
      eachMessage: async ({ message }: EachMessagePayload) => {
        if (!message.value) return

        const correlationId = message.headers?.correlationId?.toString()
        const replyTo = message.headers?.replyTo?.toString()

        if (!correlationId || !replyTo) return

        try {
          const content = JSON.parse(message.value.toString())
          const response = await handler(content)

          await this.producer!.send({
            topic: replyTo,
            messages: [
              {
                value: JSON.stringify(response),
                headers: {
                  correlationId,
                },
                timestamp: Date.now().toString(),
              },
            ],
          })
        } catch {
          // Handler failed
        }
      },
    })
  }

  private getCompressionType(): import('kafkajs').CompressionTypes {
    const compression = this.config.producer?.compression ?? 'none'
    // CompressionTypes enum values: None = 0, GZIP = 1, Snappy = 2, LZ4 = 3, ZSTD = 4
    const compressionMap: Record<string, number> = {
      none: 0,
      gzip: 1,
      snappy: 2,
      lz4: 3,
      zstd: 4,
    }
    return compressionMap[compression] as import('kafkajs').CompressionTypes
  }

  async disconnect(): Promise<void> {
    // Clear pending requests
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout)
      pending.reject(new Error('Connection closed'))
    }
    this.pendingRequests.clear()

    // Disconnect reply consumer
    if (this.replyConsumer) {
      await this.replyConsumer.disconnect()
      this.replyConsumer = null
    }

    // Disconnect consumer
    if (this.consumer) {
      await this.consumer.disconnect()
      this.consumer = null
    }

    // Disconnect producer
    if (this.producer) {
      await this.producer.disconnect()
      this.producer = null
    }

    this.kafka = null
    this.replyTopic = null
    this.subscriptions.clear()
    this.isConsumerRunning = false
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15)
  }
}
