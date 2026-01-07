import type { OnServiceDestroy, OnServiceInit } from '@navios/di'

import type { QueueClient } from '../interfaces/queue-client.mjs'
import type { SqsConfig } from '../types/queue-config.mjs'

type SQSClientType = import('@aws-sdk/client-sqs').SQSClient
type SNSClientType = import('@aws-sdk/client-sns').SNSClient
type Message = import('@aws-sdk/client-sqs').Message

interface PendingRequest {
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
  timeout: ReturnType<typeof setTimeout>
}

interface QueueInfo {
  url: string
  arn: string
}

interface TopicInfo {
  arn: string
  subscriptionArn?: string
  queueUrl?: string
}

/**
 * AWS SQS queue client adapter.
 * Implements QueueClient interface for AWS SQS with SNS for pub/sub.
 * Uses @aws-sdk/client-sqs and @aws-sdk/client-sns.
 */
export class SQSClient implements QueueClient, OnServiceInit, OnServiceDestroy {
  private sqsClient: SQSClientType | null = null
  private snsClient: SNSClientType | null = null
  private queues = new Map<string, QueueInfo>()
  private topics = new Map<string, TopicInfo>()
  private replyQueueUrl: string | null = null
  private pendingRequests = new Map<string, PendingRequest>()
  private pollingHandlers = new Map<string, { handler: (message: unknown) => Promise<void>; abortController: AbortController }>()

  constructor(private config: SqsConfig) {}

  async onServiceInit(): Promise<void> {
    const { SQSClient: SQS } = await this.loadSQS()
    const { SNSClient: SNS } = await this.loadSNS()

    const credentials = this.config.credentials
      ? {
          accessKeyId: this.config.credentials.accessKeyId,
          secretAccessKey: this.config.credentials.secretAccessKey,
          sessionToken: this.config.credentials.sessionToken,
        }
      : undefined

    this.sqsClient = new SQS({
      region: this.config.region,
      credentials,
      endpoint: this.config.endpoint,
    })

    const snsRegion = this.config.sns?.region ?? this.config.region

    this.snsClient = new SNS({
      region: snsRegion,
      credentials,
      endpoint: this.config.sns?.endpoint ?? this.config.endpoint,
    })
  }

  async onServiceDestroy(): Promise<void> {
    await this.disconnect()
  }

  private async loadSQS(): Promise<typeof import('@aws-sdk/client-sqs')> {
    try {
      return await import('@aws-sdk/client-sqs')
    } catch {
      throw new Error(
        '@aws-sdk/client-sqs is not installed. Please install it with: npm install @aws-sdk/client-sqs',
      )
    }
  }

  private async loadSNS(): Promise<typeof import('@aws-sdk/client-sns')> {
    try {
      return await import('@aws-sdk/client-sns')
    } catch {
      throw new Error(
        '@aws-sdk/client-sns is not installed. Please install it with: npm install @aws-sdk/client-sns',
      )
    }
  }

  private async ensureQueue(queueName: string): Promise<QueueInfo> {
    if (this.queues.has(queueName)) {
      return this.queues.get(queueName)!
    }

    if (!this.sqsClient) {
      throw new Error('SQS client not initialized')
    }

    const { CreateQueueCommand, GetQueueAttributesCommand } = await this.loadSQS()

    const isFifo = this.config.fifo?.enabled ?? false
    const actualQueueName = isFifo && !queueName.endsWith('.fifo')
      ? `${queueName}.fifo`
      : queueName

    const attributes: Record<string, string> = {
      VisibilityTimeout: String(this.config.visibilityTimeout ?? 30),
      MessageRetentionPeriod: String(this.config.messageRetentionPeriod ?? 345600),
      DelaySeconds: String(this.config.delaySeconds ?? 0),
    }

    if (isFifo) {
      attributes.FifoQueue = 'true'
      if (this.config.fifo?.contentBasedDeduplication) {
        attributes.ContentBasedDeduplication = 'true'
      }
      if (this.config.fifo?.deduplicationScope) {
        attributes.DeduplicationScope = this.config.fifo.deduplicationScope
      }
      if (this.config.fifo?.throughputLimit) {
        attributes.FifoThroughputLimit = this.config.fifo.throughputLimit
      }
    }

    if (this.config.deadLetter?.enabled && this.config.deadLetter.queueArn) {
      attributes.RedrivePolicy = JSON.stringify({
        deadLetterTargetArn: this.config.deadLetter.queueArn,
        maxReceiveCount: this.config.deadLetter.maxReceiveCount ?? 3,
      })
    }

    const createResult = await this.sqsClient.send(
      new CreateQueueCommand({
        QueueName: actualQueueName,
        Attributes: attributes,
      }),
    )

    const queueUrl = createResult.QueueUrl!

    const attrResult = await this.sqsClient.send(
      new GetQueueAttributesCommand({
        QueueUrl: queueUrl,
        AttributeNames: ['QueueArn'],
      }),
    )

    const queueArn = attrResult.Attributes?.QueueArn ?? ''

    const queueInfo: QueueInfo = { url: queueUrl, arn: queueArn }
    this.queues.set(queueName, queueInfo)

    return queueInfo
  }

  private async ensureTopic(topicName: string): Promise<TopicInfo> {
    if (this.topics.has(topicName)) {
      return this.topics.get(topicName)!
    }

    if (!this.snsClient) {
      throw new Error('SNS client not initialized')
    }

    const { CreateTopicCommand } = await this.loadSNS()

    const isFifo = this.config.fifo?.enabled ?? false
    const actualTopicName = isFifo && !topicName.endsWith('.fifo')
      ? `${topicName}.fifo`
      : topicName

    const attributes: Record<string, string> = {}
    if (isFifo) {
      attributes.FifoTopic = 'true'
      if (this.config.fifo?.contentBasedDeduplication) {
        attributes.ContentBasedDeduplication = 'true'
      }
    }

    const result = await this.snsClient.send(
      new CreateTopicCommand({
        Name: actualTopicName,
        Attributes: Object.keys(attributes).length > 0 ? attributes : undefined,
      }),
    )

    const topicInfo: TopicInfo = { arn: result.TopicArn! }
    this.topics.set(topicName, topicInfo)

    return topicInfo
  }

  async publish(topic: string, message: unknown): Promise<void> {
    if (!this.snsClient) {
      throw new Error('SNS client not initialized')
    }

    const { PublishCommand } = await this.loadSNS()

    const topicInfo = await this.ensureTopic(topic)
    const isFifo = this.config.fifo?.enabled ?? false

    await this.snsClient.send(
      new PublishCommand({
        TopicArn: topicInfo.arn,
        Message: JSON.stringify(message),
        ...(isFifo
          ? {
              MessageGroupId: 'default',
              MessageDeduplicationId: this.generateId(),
            }
          : {}),
      }),
    )
  }

  async subscribe(
    topic: string,
    handler: (message: unknown) => Promise<void>,
  ): Promise<void> {
    if (!this.snsClient || !this.sqsClient) {
      throw new Error('SQS/SNS clients not initialized')
    }

    const { SubscribeCommand, SetSubscriptionAttributesCommand } = await this.loadSNS()
    const { SetQueueAttributesCommand } = await this.loadSQS()

    const topicInfo = await this.ensureTopic(topic)
    const queueName = `${topic}-subscriber-${this.generateId()}`
    const queueInfo = await this.ensureQueue(queueName)

    // Allow SNS to send messages to SQS
    const policy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: { Service: 'sns.amazonaws.com' },
          Action: 'sqs:SendMessage',
          Resource: queueInfo.arn,
          Condition: {
            ArnEquals: {
              'aws:SourceArn': topicInfo.arn,
            },
          },
        },
      ],
    }

    await this.sqsClient.send(
      new SetQueueAttributesCommand({
        QueueUrl: queueInfo.url,
        Attributes: {
          Policy: JSON.stringify(policy),
        },
      }),
    )

    // Subscribe queue to topic
    const subscribeResult = await this.snsClient.send(
      new SubscribeCommand({
        TopicArn: topicInfo.arn,
        Protocol: 'sqs',
        Endpoint: queueInfo.arn,
      }),
    )

    // Enable raw message delivery
    if (subscribeResult.SubscriptionArn) {
      await this.snsClient.send(
        new SetSubscriptionAttributesCommand({
          SubscriptionArn: subscribeResult.SubscriptionArn,
          AttributeName: 'RawMessageDelivery',
          AttributeValue: 'true',
        }),
      )

      topicInfo.subscriptionArn = subscribeResult.SubscriptionArn
      topicInfo.queueUrl = queueInfo.url
    }

    // Start polling the queue
    await this.startPolling(queueInfo.url, handler)
  }

  async send(queue: string, message: unknown): Promise<void> {
    if (!this.sqsClient) {
      throw new Error('SQS client not initialized')
    }

    const { SendMessageCommand } = await this.loadSQS()

    const queueInfo = await this.ensureQueue(queue)
    const isFifo = this.config.fifo?.enabled ?? false

    await this.sqsClient.send(
      new SendMessageCommand({
        QueueUrl: queueInfo.url,
        MessageBody: JSON.stringify(message),
        DelaySeconds: this.config.delaySeconds ?? 0,
        ...(isFifo
          ? {
              MessageGroupId: 'default',
              MessageDeduplicationId: this.generateId(),
            }
          : {}),
      }),
    )
  }

  async receive(
    queue: string,
    handler: (message: unknown) => Promise<void>,
  ): Promise<void> {
    const queueInfo = await this.ensureQueue(queue)
    await this.startPolling(queueInfo.url, handler)
  }

  private async startPolling(
    queueUrl: string,
    handler: (message: unknown) => Promise<void>,
  ): Promise<void> {
    if (this.pollingHandlers.has(queueUrl)) {
      return
    }

    const abortController = new AbortController()
    this.pollingHandlers.set(queueUrl, { handler, abortController })

    this.pollQueue(queueUrl, handler, abortController.signal)
  }

  private async pollQueue(
    queueUrl: string,
    handler: (message: unknown) => Promise<void>,
    signal: AbortSignal,
  ): Promise<void> {
    if (!this.sqsClient) return

    const { ReceiveMessageCommand, DeleteMessageCommand } = await this.loadSQS()

    while (!signal.aborted) {
      try {
        const result = await this.sqsClient.send(
          new ReceiveMessageCommand({
            QueueUrl: queueUrl,
            MaxNumberOfMessages: this.config.maxNumberOfMessages ?? 10,
            WaitTimeSeconds: this.config.waitTimeSeconds ?? 20,
            VisibilityTimeout: this.config.visibilityTimeout ?? 30,
            MessageAttributeNames: ['All'],
            AttributeNames: ['All'],
          }),
        )

        if (result.Messages) {
          for (const message of result.Messages) {
            if (signal.aborted) break

            try {
              const body = this.parseMessageBody(message)
              await handler(body)

              // Delete message after successful processing
              await this.sqsClient.send(
                new DeleteMessageCommand({
                  QueueUrl: queueUrl,
                  ReceiptHandle: message.ReceiptHandle!,
                }),
              )
            } catch {
              // Message processing failed, will be redelivered after visibility timeout
            }
          }
        }
      } catch (error) {
        if (signal.aborted) break
        // Wait before retrying on error
        await new Promise((resolve) => setTimeout(resolve, 5000))
      }
    }
  }

  private parseMessageBody(message: Message): unknown {
    if (!message.Body) {
      return null
    }

    try {
      const body = JSON.parse(message.Body)

      // Check if this is an SNS notification wrapper
      if (body.Type === 'Notification' && body.Message) {
        return JSON.parse(body.Message)
      }

      return body
    } catch {
      return message.Body
    }
  }

  async request(topic: string, message: unknown): Promise<unknown> {
    if (!this.sqsClient) {
      throw new Error('SQS client not initialized')
    }

    // Set up reply queue if not exists
    if (!this.replyQueueUrl) {
      await this.setupReplyQueue()
    }

    const { SendMessageCommand } = await this.loadSQS()

    const correlationId = this.generateId()
    const requestQueue = await this.ensureQueue(`${topic}-request`)
    const isFifo = this.config.fifo?.enabled ?? false

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(correlationId)
        reject(new Error(`Request timeout for topic: ${topic}`))
      }, 30000)

      this.pendingRequests.set(correlationId, { resolve, reject, timeout })

      this.sqsClient!.send(
        new SendMessageCommand({
          QueueUrl: requestQueue.url,
          MessageBody: JSON.stringify(message),
          MessageAttributes: {
            correlationId: {
              DataType: 'String',
              StringValue: correlationId,
            },
            replyTo: {
              DataType: 'String',
              StringValue: this.replyQueueUrl!,
            },
          },
          ...(isFifo
            ? {
                MessageGroupId: 'request',
                MessageDeduplicationId: correlationId,
              }
            : {}),
        }),
      ).catch((error: unknown) => {
        clearTimeout(timeout)
        this.pendingRequests.delete(correlationId)
        reject(error)
      })
    })
  }

  private async setupReplyQueue(): Promise<void> {
    const replyQueueName = `reply-${this.generateId()}`
    const queueInfo = await this.ensureQueue(replyQueueName)

    this.replyQueueUrl = queueInfo.url

    // Start polling for replies
    const abortController = new AbortController()
    this.pollingHandlers.set(queueInfo.url, {
      handler: async () => {},
      abortController,
    })

    this.pollReplies(queueInfo.url, abortController.signal)
  }

  private async pollReplies(queueUrl: string, signal: AbortSignal): Promise<void> {
    if (!this.sqsClient) return

    const { ReceiveMessageCommand, DeleteMessageCommand } = await this.loadSQS()

    while (!signal.aborted) {
      try {
        const result = await this.sqsClient.send(
          new ReceiveMessageCommand({
            QueueUrl: queueUrl,
            MaxNumberOfMessages: 10,
            WaitTimeSeconds: 20,
            MessageAttributeNames: ['correlationId'],
          }),
        )

        if (result.Messages) {
          for (const message of result.Messages) {
            if (signal.aborted) break

            const correlationId = message.MessageAttributes?.correlationId?.StringValue
            if (!correlationId) continue

            const pending = this.pendingRequests.get(correlationId)
            if (pending) {
              clearTimeout(pending.timeout)
              this.pendingRequests.delete(correlationId)

              try {
                const content = JSON.parse(message.Body ?? '{}')
                pending.resolve(content)
              } catch (err) {
                pending.reject(err)
              }
            }

            // Delete processed message
            await this.sqsClient.send(
              new DeleteMessageCommand({
                QueueUrl: queueUrl,
                ReceiptHandle: message.ReceiptHandle!,
              }),
            )
          }
        }
      } catch {
        if (signal.aborted) break
        await new Promise((resolve) => setTimeout(resolve, 5000))
      }
    }
  }

  async reply(
    topic: string,
    handler: (message: unknown) => Promise<unknown>,
  ): Promise<void> {
    if (!this.sqsClient) {
      throw new Error('SQS client not initialized')
    }

    const { SendMessageCommand } = await this.loadSQS()

    const requestQueue = await this.ensureQueue(`${topic}-request`)
    const isFifo = this.config.fifo?.enabled ?? false

    // Custom polling that extracts reply metadata
    const abortController = new AbortController()
    this.pollingHandlers.set(requestQueue.url, { handler: async () => {}, abortController })

    const { ReceiveMessageCommand, DeleteMessageCommand } = await this.loadSQS()

    const poll = async (): Promise<void> => {
      while (!abortController.signal.aborted) {
        try {
          const result = await this.sqsClient!.send(
            new ReceiveMessageCommand({
              QueueUrl: requestQueue.url,
              MaxNumberOfMessages: this.config.maxNumberOfMessages ?? 10,
              WaitTimeSeconds: this.config.waitTimeSeconds ?? 20,
              MessageAttributeNames: ['correlationId', 'replyTo'],
            }),
          )

          if (result.Messages) {
            for (const message of result.Messages) {
              if (abortController.signal.aborted) break

              const correlationId = message.MessageAttributes?.correlationId?.StringValue
              const replyTo = message.MessageAttributes?.replyTo?.StringValue

              if (!correlationId || !replyTo) {
                // Skip messages without reply info
                continue
              }

              try {
                const content = JSON.parse(message.Body ?? '{}')
                const response = await handler(content)

                // Send reply
                await this.sqsClient!.send(
                  new SendMessageCommand({
                    QueueUrl: replyTo,
                    MessageBody: JSON.stringify(response),
                    MessageAttributes: {
                      correlationId: {
                        DataType: 'String',
                        StringValue: correlationId,
                      },
                    },
                    ...(isFifo
                      ? {
                          MessageGroupId: 'reply',
                          MessageDeduplicationId: `reply-${correlationId}`,
                        }
                      : {}),
                  }),
                )

                // Delete processed message
                await this.sqsClient!.send(
                  new DeleteMessageCommand({
                    QueueUrl: requestQueue.url,
                    ReceiptHandle: message.ReceiptHandle!,
                  }),
                )
              } catch {
                // Handler failed, message will be redelivered
              }
            }
          }
        } catch {
          if (abortController.signal.aborted) break
          await new Promise((resolve) => setTimeout(resolve, 5000))
        }
      }
    }

    poll()
  }

  async disconnect(): Promise<void> {
    // Stop all polling
    for (const [, { abortController }] of this.pollingHandlers) {
      abortController.abort()
    }
    this.pollingHandlers.clear()

    // Clear pending requests
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout)
      pending.reject(new Error('Connection closed'))
    }
    this.pendingRequests.clear()

    // Destroy clients
    if (this.sqsClient) {
      this.sqsClient.destroy()
      this.sqsClient = null
    }

    if (this.snsClient) {
      this.snsClient.destroy()
      this.snsClient = null
    }

    this.queues.clear()
    this.topics.clear()
    this.replyQueueUrl = null
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15)
  }
}
