# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - Unreleased

Ported to `@navios/core` 2.0 and `@navios/di` 2.0.

### Changed

- **BREAKING**: `zod` is no longer used or required. `SignOptions`, `VerifyOptions`, `JwtHeader`, `Secret` and `JwtServiceOptions` are plain TypeScript types with the same fields as before.
- **BREAKING**: `JwtServiceOptionsSchema` is now a hand-written [Standard Schema](https://standardschema.dev) that checks the shape of the service configuration. It no longer has zod methods such as `.parse()`, and it does not strip unknown keys.
- **BREAKING**: The configuration factory given to `provideJwtService()` receives a `FactoryContext`. Replace `await inject(ConfigService)` inside the factory with `await ctx.inject(ConfigService)`. The factory may now also be synchronous, and its result is cached per container instead of globally.
- `JwtServiceToken` is named `'JwtService'` instead of `Symbol.for('JwtService')`. Tokens are identified by the token object, so this only changes error messages.
- `JwtService` is registered with `registerInjectable()` instead of the `@Injectable()` decorator, so the package is built without a decorator transform.

### Removed

- **BREAKING**: The zod schemas `AlgorithmType`, `JwtHeaderSchema`, `SignOptionsSchema`, `VerifyOptionsSchema` and `SecretSchema`. Use the types `Algorithm`, `JwtHeader`, `SignOptions`, `VerifyOptions` and `Secret`. Options of individual `sign()` and `verify()` calls are validated by `jsonwebtoken`, as before.
- `zod` from `peerDependencies`.

### Added

- The `Algorithm` type.
- `JwtService` is the default provider of `JwtServiceToken` and can be replaced with `provide(JwtServiceToken, Impl)` in application or module `providers`.
- `secretOrKeyProvider` may return a promise, so a key can be looked up remotely (JWKS). `signAsync()` and `verifyAsync()` await it; `sign()` and `verify()` throw an error that names the async method.
- `secret`, `publicKey` and `privateKey` accept a Node.js `KeyObject` everywhere, and `secret` in the configuration also accepts a `Buffer`.
- `TokenExpiredError`, `NotBeforeError` and `JsonWebTokenError` are exported as types as well as values, so `let error: TokenExpiredError` compiles.
- `files` in `package.json`: only `lib`, the README, the changelog and the license are published.

### Fixed

- **BREAKING**: A `secret`, `privateKey` or `publicKey` passed to a single call now wins over everything configured on the service. Before, `secretOrKeyProvider` silently overrode a per-call `secret`, and the `secret` of the service overrode a per-call key, so `verify(token, { publicKey, algorithms: ['RS256'] })` threw on a service configured with a `secret`. The order is: per-call `secret`, per-call key, `secretOrKeyProvider`, service `secret`, service key.
- `provideJwtService({ secret: Buffer })` and `provideJwtService({ publicKey: KeyObject })` no longer fail the configuration check.
- `sign('string payload')` no longer throws when the service has default `signOptions`. The claim defaults (`expiresIn`, `notBefore`, `noTimestamp`, `audience`, `issuer`, `subject`, `jwtid`) are not applied to a string or `Buffer` payload; a string payload is rejected only when the caller passes one of these options.
- `decode()` is typed as returning `T | null`; it always returned `null` for a token it could not decode.
- `@types/jsonwebtoken` is a dependency instead of a dev dependency: the published type declarations import from it.
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
