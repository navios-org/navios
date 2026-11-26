import { generateId } from '../generate-id.mjs'
import { PendingRequests } from '../pending-requests.mjs'

import type { QueueClient } from '../../client/queue-client.mjs'

import { buildSaslConfig, getCompressionType } from './kafkajs-options.mjs'
import { loadKafkaJS } from './load-kafkajs.mjs'

import type { KafkaConfig } from './kafka-config.mjs'

type KafkaInstance = import('kafkajs').Kafka
type Producer = import('kafkajs').Producer
type Consumer = import('kafkajs').Consumer
type EachMessagePayload = import('kafkajs').EachMessagePayload

/**
 * Kafka queue client adapter.
 * Implements QueueClient interface for Apache Kafka.
 * Uses kafkajs for connection management.
 */
export class KafkaClient implements QueueClient {
  private kafka: KafkaInstance | null = null
  private producer: Producer | null = null
  private consumer: Consumer | null = null
  private replyConsumer: Consumer | null = null
  private replyTopic: string | null = null
  private pendingRequests = new PendingRequests()
  private subscriptions = new Map<string, (message: unknown) => Promise<void>>()
  private isConsumerRunning = false

  constructor(private config: KafkaConfig) {}

  /** Connects the producer. `QueueClientFactory` calls it before it hands the client out. */
  async connect(): Promise<void> {
    const kafkajs = await loadKafkaJS()

    const ssl =
      this.config.ssl === true
        ? true
        : this.config.ssl
          ? {
              rejectUnauthorized: this.config.ssl.rejectUnauthorized,
              ca: this.config.ssl.ca ? [this.config.ssl.ca] : undefined,
              cert: this.config.ssl.cert,
              key: this.config.ssl.key,
            }
          : undefined

    const sasl = this.config.sasl ? buildSaslConfig(this.config.sasl) : undefined

    this.kafka = new kafkajs.Kafka({
      clientId: this.config.clientId,
      brokers: this.config.brokers,
      connectionTimeout: this.config.connectionTimeout,
      requestTimeout: this.config.requestTimeout,
      ssl,
      sasl,
      retry: this.config.retry,
    })

    // Initialize producer
    this.producer = this.kafka.producer(
      this.config.producer
        ? {
            allowAutoTopicCreation: true,
            transactionTimeout: this.config.producer.timeout,
            idempotent: this.config.producer.idempotent,
            transactionalId: this.config.producer.transactionalId,
            maxInFlightRequests: this.config.producer.maxInFlightRequests,
          }
        : undefined,
    )

    await this.producer.connect()
  }

  private async ensureConsumer(): Promise<Consumer> {
    if (!this.kafka) {
      throw new Error('Kafka client not initialized')
    }

    if (!this.consumer) {
      // `fromBeginning` is an option of subscribe(). Without a `consumer` entry
      // kafkajs applies the same defaults as kafkaConfigSchema.
      const { fromBeginning: _, ...options } = this.config.consumer ?? {
        groupId: `navios-consumer-${generateId()}`,
        fromBeginning: false,
      }

      this.consumer = this.kafka.consumer(options)

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

    const compression = getCompressionType(this.config)

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
      fromBeginning: this.config.consumer?.fromBeginning,
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

    const correlationId = generateId()
    const requestTopic = `${topic}.request`

    const reply = this.pendingRequests.create(correlationId, `topic: ${topic}`)

    this.producer
      .send({
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
      })
      .catch((error: unknown) => this.pendingRequests.fail(correlationId, error))

    return reply
  }

  private async setupReplyConsumer(): Promise<void> {
    if (!this.kafka) {
      throw new Error('Kafka client not initialized')
    }

    this.replyTopic = `reply.${generateId()}`
    const replyGroupId = `reply-consumer-${generateId()}`

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
        if (correlationId && message.value) {
          this.pendingRequests.settle(correlationId, message.value.toString())
        }
      },
    })
  }

  async reply(topic: string, handler: (message: unknown) => Promise<unknown>): Promise<void> {
    if (!this.producer || !this.kafka) {
      throw new Error('Kafka client not initialized')
    }

    const requestTopic = `${topic}.request`
    const replyGroupId = `reply-handler-${generateId()}`

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

  async disconnect(): Promise<void> {
    this.pendingRequests.rejectAll()

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
}
