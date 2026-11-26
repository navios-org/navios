# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0-alpha.0] - Unreleased

Ported to `@navios/di` 2.0.

### Changed

- **BREAKING**: `DefaultQueueConfigService` is the default provider of `QueueConfigServiceToken` instead of a provider registered with `priority: -1000`. Replace it with `provide(QueueConfigServiceToken, YourConfigService)` in `NaviosFactory.create(..., { providers })`, `@Module({ providers })`, `new Container({ providers })` or `container.provide()`. A second `@Injectable({ token: QueueConfigServiceToken })` now throws `ProviderConflict`.
- `QueueClientToken` without arguments and with `{ name: 'default' }` now resolve to the same client. Its argument schema normalises missing arguments to `{ name: 'default' }`; before, the two forms created two connections.
- `messageBuilder()` returns `PubSubMessageDefinition`, `PointToPointMessageDefinition` and `RequestReplyMessageDefinition`, which extend `MessageDefinition` and state that `topic`, `queue` and `responseSchema` are set.
- `QueueClientFactory`, `DefaultQueueConfigService`, `QueuePublisher`, `QueueSender` and `QueueRequester` are registered with `registerFactory()` / `registerInjectable()` instead of decorators.
- **BREAKING**: `RabbitMQClient`, `KafkaClient` and `SQSClient` no longer implement `OnServiceInit` and `OnServiceDestroy`. `onServiceInit()` is renamed `connect()`, and `onServiceDestroy()` is removed: call `disconnect()`. `QueueClientFactory` calls `connect()` and registers `disconnect()` with `ctx.addDestroyListener`: in `@navios/di` 2.0 the container calls the lifecycle hooks of classes it constructs, not of a factory's product.

- **BREAKING**: `QueueClientFactory` parses the entry of the requested name with `abstractQueueConfigSchema` when its client is first resolved. The defaults of the broker schemas are applied there, and an invalid entry rejects the resolution with `Invalid configuration of queue <name>` and the zod issues. `QueueConfig` is the schema input, `Record<string, z.input<typeof abstractQueueConfigSchema>>`, so an entry leaves out what has a default; before, it was the output type and an entry had to spell out every default. The broker clients take a parsed entry (`RabbitmqConfig`, `KafkaConfig` and `SqsConfig` are output types) and no longer re-apply the defaults themselves.
- `kafkaConfigSchema` defaults `clientId` to `'navios-queue-client'`, the name the client used. The RabbitMQ `connectionOptions`, `retry`, `exchange` and `queue` and the SQS `fifo` options are filled with their defaults when they are left out.

### Removed

- **BREAKING**: `queueConfigSchema`. It accepted `{ default }` or any record and was never used to parse; validate an entry with `abstractQueueConfigSchema`.

### Added

- `QueuePublisherToken`, `QueueSenderToken`, `QueueRequesterToken` and their argument schemas are exported from the package entry, together with `queueClientOptionsSchema`.
- README documentation of configuration, clients and typed messages.

### Fixed

- Importing the package threw `Invalid discriminated union option at index "0"`: `abstractMessageDefinitionSchema` was a `z.discriminatedUnion('pattern', ...)` over objects whose discriminator is nested under `config`. It is now a plain union.
- `QueuePublisherToken`, `QueueSenderToken` and `QueueRequesterToken` validated `messageDef` against the message _config_ schema, so every declaration returned by `messageBuilder()` was rejected. They now validate against the message _definition_ schemas.
- `RabbitMQClient.request()` ignored a failed publish: the request waited for its 30 s timeout and the publish error surfaced as an unhandled rejection. The request now rejects with that error, as it does in `KafkaClient` and `SQSClient`.
- `kafkaConfigSchema` rejected a retry `factor` of `0.2`, its own default (`min(1)`). `factor` is the kafkajs randomisation factor and now accepts 0 to 1.
