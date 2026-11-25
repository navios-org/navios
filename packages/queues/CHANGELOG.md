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
- `QueueClientFactory` still connects the client itself (`onServiceInit`) and disconnects it through `ctx.addDestroyListener`: in `@navios/di` 2.0 the container calls the lifecycle hooks of classes it constructs, not of a factory's product.

### Added

- `QueuePublisherToken`, `QueueSenderToken`, `QueueRequesterToken` and their argument schemas are exported from the package entry, together with `queueClientOptionsSchema`.
- README documentation of configuration, clients and typed messages.

### Fixed

- Importing the package threw `Invalid discriminated union option at index "0"`: `abstractMessageDefinitionSchema` was a `z.discriminatedUnion('pattern', ...)` over objects whose discriminator is nested under `config`. It is now a plain union.
- `QueuePublisherToken`, `QueueSenderToken` and `QueueRequesterToken` validated `messageDef` against the message _config_ schema, so every declaration returned by `messageBuilder()` was rejected. They now validate against the message _definition_ schemas.
