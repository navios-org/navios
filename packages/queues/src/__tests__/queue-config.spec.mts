import { describe, expect, it } from 'vitest'

import { abstractQueueConfigSchema, kafkaConfigSchema } from '../index.mjs'

describe('queue configuration schemas', () => {
  it('should fill the defaults of a RabbitMQ entry, option objects included', () => {
    const config = abstractQueueConfigSchema.parse({ type: 'rabbitmq', url: 'amqp://host:5672' })

    expect(config).toMatchObject({
      vhost: '/',
      heartbeatIntervalInSeconds: 5,
      prefetch: 10,
      connectionOptions: { timeout: 30000, keepAlive: true, keepAliveDelay: 10000, noDelay: false },
      retry: { maxRetries: 3 },
      exchange: { type: 'topic', durable: true, autoDelete: false },
      queue: { durable: true, autoDelete: false, exclusive: false },
    })
  })

  it('should fill the defaults of an SQS entry, FIFO options included', () => {
    const config = abstractQueueConfigSchema.parse({ type: 'sqs', region: 'eu-west-1' })

    expect(config).toMatchObject({
      visibilityTimeout: 30,
      waitTimeSeconds: 20,
      maxNumberOfMessages: 10,
      messageRetentionPeriod: 345600,
      delaySeconds: 0,
      fifo: { enabled: false, deduplicationScope: 'queue', throughputLimit: 'perQueue' },
    })
  })

  it('should fill the defaults of a Kafka entry and of its retry options', () => {
    const config = kafkaConfigSchema.parse({ type: 'kafka', brokers: ['b:9092'], retry: {} })

    expect(config).toMatchObject({
      clientId: 'navios-queue-client',
      connectionTimeout: 30000,
      requestTimeout: 30000,
      retry: { maxRetryTime: 30000, initialRetryTime: 300, factor: 0.2, multiplier: 2, retries: 5 },
    })
  })

  it('should accept a Kafka retry factor between 0 and 1, the default included', () => {
    const parse = (factor: number) =>
      kafkaConfigSchema.safeParse({ type: 'kafka', brokers: ['b:9092'], retry: { factor } })

    expect(parse(0.2).success).toBe(true)
    expect(parse(0).success).toBe(true)
    expect(parse(1).success).toBe(true)
    expect(parse(1.5).success).toBe(false)
    expect(parse(-0.1).success).toBe(false)
  })
})
