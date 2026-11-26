# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0-alpha.1] - Unreleased

### Changed

- **BREAKING**: The peer dependency is `@navios/di` instead of `@navios/core`. The package only uses the container, so it works in an application of `@navios/di` alone. A project that lists `@navios/core` but not `@navios/di` adds `@navios/di` with the same version.

## [2.0.0-alpha.0] - 2026-11-26

Ported to `@navios/core` 2.0 and `@navios/di` 2.0.

### Changed

- **BREAKING**: `zod` is no longer used or required. `JwtHeader` and `JwtServiceOptions` are plain TypeScript types. The configuration is checked when the service is created; an error is a `DIError` with the code `InitializationError` when the service is resolved from a container.
- **BREAKING**: `provideJwtService()` returns an `InjectionToken<JwtService>` of its own for every call, instead of a token bound to `JwtServiceToken`. Two services are two tokens, and each can be replaced with `provide(token, Impl)` or `TestContainer.bind(token)`. `provideJwtService(config, { name })` names the token in error messages.
- **BREAKING**: The configuration factory given to `provideJwtService()` receives a `FactoryContext`. Replace `await inject(ConfigService)` inside the factory with `await ctx.inject(ConfigService)`. The factory may now also be synchronous, and it runs once per container instead of once globally.
- **BREAKING**: `secretOrKeyProvider` is replaced by `keys`. It is called with `{ use: 'verify', header }` (the parsed header; a malformed token is rejected before) or `{ use: 'sign', payload }`, and returns a key, `{ key, keyid, algorithms }`, or `undefined` when there is no such key, which rejects the token. So does a value that is not a key, or a key of a type that is not supported (Ed25519 in a JWKS), because the sender of the token chooses the `kid`. `keyid` becomes the `kid` header when signing. It may return a promise, so a key can be looked up remotely (JWKS): `signAsync()` and `verifyAsync()` await it; `sign()` and `verify()` throw an error that names the async method. Text and bytes returned without algorithms are refused; a `KeyObject` needs none.
- **BREAKING**: `TokenExpiredError`, `NotBeforeError` and `JsonWebTokenError` are classes of this package instead of those of `jsonwebtoken`, with the same names and fields. They carry the original error as `cause` instead of `inner`.
- **BREAKING**: A key is parsed once, when the service is created, as what it is configured as. A `publicKey` or `privateKey` that is not a PEM or a `KeyObject`, and an encoded key in `secret`, are configuration errors.
- **BREAKING**: Without `algorithms`, the accepted algorithms are those of the type of the key, and for an EC key those of its curve. `algorithms` that cannot be used with the key are a configuration error. The default `algorithm` for signing follows the type of the key too, instead of always being `HS256`.
- **BREAKING**: A key that is present but `undefined` or empty (an environment variable that is not set), and a sign or verify option without a value, are configuration errors. `{}` is a service without keys. A call without any key throws a plain `Error` instead of a `JsonWebTokenError`, which guards answer with 401.
- **BREAKING**: A wrong verify option is a plain `Error`. Options that would not check anything are refused: an empty `audience`, `issuer`, `subject`, `jwtid` or `nonce`, a `maxAge` of 0, a `clockTolerance` that is not a number.
- **BREAKING**: `expiresIn`, `notBefore` and `maxAge` refuse a string without a unit; `'900'` was 900 milliseconds. Use a number of seconds or `'900s'`.
- **BREAKING**: `verify()` rejects a token whose payload is not an object. Its result is `JwtPayload` by default instead of `any`, and `JwtComplete` with `complete: true`. `complete` is an option of a call only.
- **BREAKING**: `new JwtService()` takes the configuration as a required argument and no longer needs an injection context. The public `logger` property is gone.
- **BREAKING**: `Secret` is renamed to `JwtPrivateKey`; `JwtKey` is a key that cannot have a passphrase. `signOptions.audience` no longer allows a `RegExp`, which never worked.

### Removed

- **BREAKING**: The zod schemas `AlgorithmType`, `JwtHeaderSchema`, `SignOptionsSchema`, `VerifyOptionsSchema`, `SecretSchema` and `JwtServiceOptionsSchema`. Use the types `Algorithm`, `JwtHeader`, `JwtSignOptions`, `JwtVerifyOptions` and `JwtServiceOptions`.
- **BREAKING**: `JwtServiceToken`. Use the token `provideJwtService()` returns.
- **BREAKING**: `RequestType`, `GetSecretKeyResult`, `SignOptions` and `VerifyOptions`.
- **BREAKING**: The algorithm `none`, in every option and in `header.alg`.
- **BREAKING**: The option `allowInvalidAsymmetricKeyTypes`. The type of the key decides.
- `zod` from `peerDependencies`.

### Added

- The types `Algorithm`, `JwtPayload`, `JwtComplete`, `JwtDecodeOptions`, `JwtKey`, `JwtPrivateKey`, `JwtKeyRequest` and `JwtKeyMaterial`.
- `secret`, `publicKey` and `privateKey` accept a Node.js `KeyObject` and a `Uint8Array` everywhere.
- A process warning (`NAVIOS_JWT_SHORT_SECRET`) when the HMAC secret of a service is shorter than 32 bytes, once per process.
- `null` for `expiresIn`, `notBefore`, `audience`, `issuer`, `subject` or `jwtid` of a single `sign()` call leaves out the default of the service.
- `header` may be given without `alg`, for example `{ kid }`.
- `TokenExpiredError`, `NotBeforeError` and `JsonWebTokenError` are exported as types as well as values, so `let error: TokenExpiredError` compiles.
- `files` in `package.json`: only `lib`, the README, the changelog and the license are published.

### Fixed

- **Security**: A `publicKey` that does not parse (DER, base64, JWK, or a PEM whose line breaks are the characters `\n`) is no longer used as an HMAC secret, with which anyone who knows the public key could sign a token.
- **Security**: An option of a call that is `undefined` no longer replaces the configured one. `verify(token, { audience: undefined })` switched off the configured audience check, and `sign(payload, { expiresIn: undefined })` threw.
- **Security**: **BREAKING**: A `secret`, `privateKey` or `publicKey` passed to a single call always wins over everything configured on the service, and an `undefined` or empty one is an error. Before, `secretOrKeyProvider` silently overrode a per-call `secret`, the `secret` of the service overrode a per-call key, and an empty key fell back to the key of the service. The order is: per-call `secret`, per-call key, `keys`, service `secret`, service key.
- **Security**: A service that is inspected, serialised or logged does not show its keys, and neither do configuration errors.
- `verify()` and `verifyAsync()` throw a `JsonWebTokenError` for every token that cannot be accepted. A payload that is not JSON, an ECDSA signature of the wrong length and others were a `SyntaxError`, `TypeError` or `Error`, which answered 500.
- `decode()` returns `null` for every token it cannot decode, and is typed as returning `T | null`. It threw a `SyntaxError` for a payload that is not JSON.
- Keys are no longer parsed for every call: with a string secret `verify()` and `sign()` are more than four times as fast.
- A default of `signOptions` is not applied to a claim the payload already has, so a verified payload can be signed again.
- `sign('string payload')` no longer throws when the service has default `signOptions`. The claim defaults (`expiresIn`, `notBefore`, `noTimestamp`, `audience`, `issuer`, `subject`, `jwtid`) are not applied to a string or `Buffer` payload; a string payload is rejected only when the caller passes one of these options.
- The configuration types can be used with `exactOptionalPropertyTypes`, and the published type declarations no longer import from `jsonwebtoken`.
- `repository.url` points to `navios-org/navios`.

## [1.0.0] - 2026-01-09

### Added

- **Stable Release**: First stable release of @navios/jwt
  - Production-ready JWT authentication and authorization for Navios
  - Type-safe JWT token generation and validation
  - Seamless integration with Navios guards and dependency injection

## [1.0.0-alpha.3] - 2026-01-08

### Changed

- **Simplified Internal Implementation**: Refactored `JwtService` with extracted helper methods
  - New `prepareSign()` private method for sign option preparation
  - New `prepareVerify()` private method for verify option preparation
  - Reduced code duplication between sync and async methods
- **Improved JSDoc Documentation**: Updated method documentation for clarity
  - Removed outdated references to async `secretOrKeyProvider` warnings
  - Simplified async method descriptions

### Dependencies

- Updated to support `@navios/core` ^1.0.0-alpha.3

## [1.0.0-alpha.2] - 2026-01-07

### Dependencies

- Updated to support `@navios/core` ^1.0.0-alpha.2

## [0.9.0] - 2025-12-23

### Dependencies

- Updated to support `@navios/core` ^0.9.0

## [0.8.0] - 2025-12-21

### Dependencies

- Updated to support `@navios/core` ^0.8.0

## [0.7.1] - 2025-12-20

### Fixed

- Fixed package.json exports to use correct CommonJS file extensions (`.cjs` and `.d.cts`)

## [0.7.0] - 2025-12-18

### Added

- **Comprehensive JSDoc Documentation**: Added detailed JSDoc comments to all public APIs including:
  - `JwtService` class and all methods (`sign`, `signAsync`, `verify`, `verifyAsync`, `decode`)
  - `provideJwtService` function with overloads
  - Type definitions and interfaces (`JwtServiceOptions`, `JwtSignOptions`, `JwtVerifyOptions`, etc.)
  - Error classes (`TokenExpiredError`, `NotBeforeError`, `JsonWebTokenError`)
- **Enhanced README**: Improved documentation with better examples, clearer API reference, and usage patterns

### Documentation

- Complete JSDoc comments for better IDE support and developer experience
- Updated README with comprehensive examples and API documentation
- Clarified usage patterns for synchronous and asynchronous operations
- Added examples for different JWT algorithms and key management strategies
