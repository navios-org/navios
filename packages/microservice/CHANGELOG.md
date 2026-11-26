# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0-alpha.0] - Unreleased

Rewritten as a transport of a `@navios/core` 2.0 application. Earlier versions declared the decorators but could not consume a message.

### Breaking

- **`messageTransport(options)` replaces `MicroserviceFactory` and `MessageHandlerService`.** Pass it to `createApplication` from `@navios/core`, or to `NaviosFactory.create` from `@navios/server` beside HTTP.
- **`@MessageModule` is removed.** List message controllers in `@Module({ messageControllers: [...] })`.
- **Message controllers are singletons.** `@MessageController` takes `guards` and `interceptors`; the `scope` option is removed.
- **Guards receive a `MessageContext`**: `canActivate(ctx)`, with `ctx.message`, `ctx.payload` and `ctx.raw`. `MessageExecutionContext` is removed. `MessageGuard` is `Guard<MessageContext>`.
- **A handler receives the validated payload**, the output of `payloadSchema`.
- The metadata helpers `getMessageModuleMetadata`, `hasMessageModuleMetadata`, `getMessageHandlerMetadata` and the `MessageMetadata`, `MessageModuleMetadata` and `MessageHandlerMetadata` types are removed.
- **The attributes `Ack`, `NoAck`, `ManualAck`, `Retry`, `DeadLetterQueue`, `Concurrency`, `Timeout`, `ErrorHandling`, `Idempotency`, `RateLimit`, `BatchProcessing` and `Priority` are removed.** Nothing acted on them; acknowledgement and retries are what the queue client does when a handler resolves or rejects. `zod` is no longer imported at runtime, only by the `MessageParams` and `MessageResult` types.

### Added

- Handlers are subscribed with the queue client when the application starts: `subscribe` for pub/sub, `receive` for point-to-point, `reply` for request-reply.
- A delivery runs the interceptors of the application, the guards and the other interceptors, validates the payload and calls the handler; the reply of a request-reply handler is validated. `MessageValidationError` and `MessageDeniedError`.
- `transport.dispatch(message, payload)` delivers a message in process, for tests.
- `transport.handlers()` lists the handlers.
- `MessageInterceptor`, `isMessageContext`.
- `app.close()` waits for the messages in flight.
- A module that lists something other than a class in `messageControllers`, as an import cycle between files leaves `undefined` behind, fails at `init()` with the name of the module.
