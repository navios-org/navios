// Client contract and injection token
export type { QueueClient } from './client/index.mjs'
export { QueueClientToken, queueClientOptionsSchema } from './client/index.mjs'

// Factory that builds the configured broker client for QueueClientToken
export { QueueClientFactory } from './queue-client-factory.mjs'

// Broker clients and their configuration
export {
  KafkaClient,
  RabbitMQClient,
  SQSClient,
  deadLetterConfigSchema,
  kafkaConfigSchema,
  kafkaSaslConfigSchema,
  rabbitmqConfigSchema,
  retryConfigSchema,
  sqsConfigSchema,
  tlsConfigSchema,
} from './brokers/index.mjs'
export type {
  DeadLetterConfig,
  KafkaConfig,
  KafkaSaslConfig,
  RabbitmqConfig,
  RetryConfig,
  SqsConfig,
  TlsConfig,
} from './brokers/index.mjs'

// Queue configuration and the service that provides it
export {
  DefaultQueueConfigService,
  QueueConfigServiceToken,
  abstractQueueConfigSchema,
} from './config/index.mjs'
export type { AbstractQueueConfig, QueueConfig, QueueConfigService } from './config/index.mjs'

// Message definitions and the pattern services that send them
export {
  QueuePublisher,
  QueuePublisherToken,
  QueueRequester,
  QueueRequesterToken,
  QueueSender,
  QueueSenderToken,
  messageBuilder,
  pointToPointMessageConfigSchema,
  pointToPointMessageDefinitionSchema,
  pubsubMessageConfigSchema,
  pubsubMessageDefinitionSchema,
  queuePublisherOptionsSchema,
  queueRequesterOptionsSchema,
  queueSenderOptionsSchema,
  requestReplyMessageConfigSchema,
  requestReplyMessageDefinitionSchema,
} from './messaging/index.mjs'
export type {
  BaseMessageConfig,
  MessageDefinition,
  MessagePattern,
  PointToPointMessageDefinition,
  PubSubMessageDefinition,
  RequestReplyMessageDefinition,
} from './messaging/index.mjs'
