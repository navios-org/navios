import { generateId } from '../generate-id.mjs'
import { PendingRequests } from '../pending-requests.mjs'

import type { QueueClient } from '../../client/queue-client.mjs'

import { loadSNS, loadSQS } from './load-aws-sdk.mjs'
import { parseMessageBody } from './sqs-message-body.mjs'

import type { SqsConfig } from './sqs-config.mjs'

type SQSClientType = import('@aws-sdk/client-sqs').SQSClient
type SNSClientType = import('@aws-sdk/client-sns').SNSClient

interface QueueInfo {
  url: string
  arn: string
}

/**
 * AWS SQS queue client adapter.
 * Implements QueueClient interface for AWS SQS with SNS for pub/sub.
 * Uses @aws-sdk/client-sqs and @aws-sdk/client-sns.
 */
export class SQSClient implements QueueClient {
  private sqsClient: SQSClientType | null = null
  private snsClient: SNSClientType | null = null
  private queues = new Map<string, QueueInfo>()
  /** SNS topic ARNs by topic name */
  private topicArns = new Map<string, string>()
  private replyQueueUrl: string | null = null
  private pendingRequests = new PendingRequests()
  /** Stops the poll loop of each polled queue URL */
  private pollers = new Map<string, AbortController>()

  constructor(private config: SqsConfig) {}

  /** Creates the SQS and SNS clients. `QueueClientFactory` calls it before it hands the client out. */
  async connect(): Promise<void> {
    const { SQSClient: SQS } = await loadSQS()
    const { SNSClient: SNS } = await loadSNS()

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

  private async ensureQueue(queueName: string): Promise<QueueInfo> {
    if (this.queues.has(queueName)) {
      return this.queues.get(queueName)!
    }

    if (!this.sqsClient) {
      throw new Error('SQS client not initialized')
    }

    const { CreateQueueCommand, GetQueueAttributesCommand } = await loadSQS()

    const isFifo = this.config.fifo.enabled
    const actualQueueName = isFifo && !queueName.endsWith('.fifo') ? `${queueName}.fifo` : queueName

    const attributes: Record<string, string> = {
      VisibilityTimeout: String(this.config.visibilityTimeout),
      MessageRetentionPeriod: String(this.config.messageRetentionPeriod),
      DelaySeconds: String(this.config.delaySeconds),
    }

    if (isFifo) {
      attributes.FifoQueue = 'true'
      if (this.config.fifo.contentBasedDeduplication) {
        attributes.ContentBasedDeduplication = 'true'
      }
      attributes.DeduplicationScope = this.config.fifo.deduplicationScope
      attributes.FifoThroughputLimit = this.config.fifo.throughputLimit
    }

    if (this.config.deadLetter?.enabled && this.config.deadLetter.queueArn) {
      attributes.RedrivePolicy = JSON.stringify({
        deadLetterTargetArn: this.config.deadLetter.queueArn,
        maxReceiveCount: this.config.deadLetter.maxReceiveCount,
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

  private async ensureTopic(topicName: string): Promise<string> {
    if (this.topicArns.has(topicName)) {
      return this.topicArns.get(topicName)!
    }

    if (!this.snsClient) {
      throw new Error('SNS client not initialized')
    }

    const { CreateTopicCommand } = await loadSNS()

    const isFifo = this.config.fifo.enabled
    const actualTopicName = isFifo && !topicName.endsWith('.fifo') ? `${topicName}.fifo` : topicName

    const attributes: Record<string, string> = {}
    if (isFifo) {
      attributes.FifoTopic = 'true'
      if (this.config.fifo.contentBasedDeduplication) {
        attributes.ContentBasedDeduplication = 'true'
      }
    }

    const result = await this.snsClient.send(
      new CreateTopicCommand({
        Name: actualTopicName,
        Attributes: Object.keys(attributes).length > 0 ? attributes : undefined,
      }),
    )

    const topicArn = result.TopicArn!
    this.topicArns.set(topicName, topicArn)

    return topicArn
  }

  async publish(topic: string, message: unknown): Promise<void> {
    if (!this.snsClient) {
      throw new Error('SNS client not initialized')
    }

    const { PublishCommand } = await loadSNS()

    const topicArn = await this.ensureTopic(topic)
    const isFifo = this.config.fifo.enabled

    await this.snsClient.send(
      new PublishCommand({
        TopicArn: topicArn,
        Message: JSON.stringify(message),
        ...(isFifo
          ? {
              MessageGroupId: 'default',
              MessageDeduplicationId: generateId(),
            }
          : {}),
      }),
    )
  }

  async subscribe(topic: string, handler: (message: unknown) => Promise<void>): Promise<void> {
    if (!this.snsClient || !this.sqsClient) {
      throw new Error('SQS/SNS clients not initialized')
    }

    const { SubscribeCommand, SetSubscriptionAttributesCommand } = await loadSNS()
    const { SetQueueAttributesCommand } = await loadSQS()

    const topicArn = await this.ensureTopic(topic)
    const queueName = `${topic}-subscriber-${generateId()}`
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
              'aws:SourceArn': topicArn,
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
        TopicArn: topicArn,
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
    }

    // Start polling the queue
    await this.startPolling(queueInfo.url, handler)
  }

  async send(queue: string, message: unknown): Promise<void> {
    if (!this.sqsClient) {
      throw new Error('SQS client not initialized')
    }

    const { SendMessageCommand } = await loadSQS()

    const queueInfo = await this.ensureQueue(queue)
    const isFifo = this.config.fifo.enabled

    await this.sqsClient.send(
      new SendMessageCommand({
        QueueUrl: queueInfo.url,
        MessageBody: JSON.stringify(message),
        DelaySeconds: this.config.delaySeconds,
        ...(isFifo
          ? {
              MessageGroupId: 'default',
              MessageDeduplicationId: generateId(),
            }
          : {}),
      }),
    )
  }

  async receive(queue: string, handler: (message: unknown) => Promise<void>): Promise<void> {
    const queueInfo = await this.ensureQueue(queue)
    await this.startPolling(queueInfo.url, handler)
  }

  private async startPolling(
    queueUrl: string,
    handler: (message: unknown) => Promise<void>,
  ): Promise<void> {
    if (this.pollers.has(queueUrl)) {
      return
    }

    const abortController = new AbortController()
    this.pollers.set(queueUrl, abortController)

    this.pollQueue(queueUrl, handler, abortController.signal)
  }

  private async pollQueue(
    queueUrl: string,
    handler: (message: unknown) => Promise<void>,
    signal: AbortSignal,
  ): Promise<void> {
    if (!this.sqsClient) return

    const { ReceiveMessageCommand, DeleteMessageCommand } = await loadSQS()

    while (!signal.aborted) {
      try {
        const result = await this.sqsClient.send(
          new ReceiveMessageCommand({
            QueueUrl: queueUrl,
            MaxNumberOfMessages: this.config.maxNumberOfMessages,
            WaitTimeSeconds: this.config.waitTimeSeconds,
            VisibilityTimeout: this.config.visibilityTimeout,
            MessageAttributeNames: ['All'],
            AttributeNames: ['All'],
          }),
        )

        if (result.Messages) {
          for (const message of result.Messages) {
            if (signal.aborted) break

            try {
              const body = parseMessageBody(message)
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
      } catch {
        if (signal.aborted) break
        // Wait before retrying on error
        await new Promise((resolve) => setTimeout(resolve, 5000))
      }
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

    const { SendMessageCommand } = await loadSQS()

    const correlationId = generateId()
    const requestQueue = await this.ensureQueue(`${topic}-request`)
    const isFifo = this.config.fifo.enabled

    const reply = this.pendingRequests.create(correlationId, `topic: ${topic}`)

    this.sqsClient
      .send(
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
      )
      .catch((error: unknown) => this.pendingRequests.fail(correlationId, error))

    return reply
  }

  private async setupReplyQueue(): Promise<void> {
    const replyQueueName = `reply-${generateId()}`
    const queueInfo = await this.ensureQueue(replyQueueName)

    this.replyQueueUrl = queueInfo.url

    // Start polling for replies
    const abortController = new AbortController()
    this.pollers.set(queueInfo.url, abortController)

    this.pollReplies(queueInfo.url, abortController.signal)
  }

  private async pollReplies(queueUrl: string, signal: AbortSignal): Promise<void> {
    if (!this.sqsClient) return

    const { ReceiveMessageCommand, DeleteMessageCommand } = await loadSQS()

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

            this.pendingRequests.settle(correlationId, message.Body ?? '{}')

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

  async reply(topic: string, handler: (message: unknown) => Promise<unknown>): Promise<void> {
    if (!this.sqsClient) {
      throw new Error('SQS client not initialized')
    }

    const { SendMessageCommand } = await loadSQS()

    const requestQueue = await this.ensureQueue(`${topic}-request`)
    const isFifo = this.config.fifo.enabled

    // Custom polling that extracts reply metadata
    const abortController = new AbortController()
    this.pollers.set(requestQueue.url, abortController)

    const { ReceiveMessageCommand, DeleteMessageCommand } = await loadSQS()

    const poll = async (): Promise<void> => {
      while (!abortController.signal.aborted) {
        try {
          const result = await this.sqsClient!.send(
            new ReceiveMessageCommand({
              QueueUrl: requestQueue.url,
              MaxNumberOfMessages: this.config.maxNumberOfMessages,
              WaitTimeSeconds: this.config.waitTimeSeconds,
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
    for (const abortController of this.pollers.values()) {
      abortController.abort()
    }
    this.pollers.clear()

    this.pendingRequests.rejectAll()

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
    this.topicArns.clear()
    this.replyQueueUrl = null
  }
}
