# Changelog

## [1.0.0-alpha.2] - 2026-01-07

### Changed

- **Server-Side Type Inference**: `RequestArgs` type now correctly uses `z.output` types for server-side handlers instead of `z.input`
  - Server handlers receive parsed/transformed values from Zod schemas
  - Client-side still uses `z.input` for raw input values
  - Affects `urlParams`, `params` (query), and `data` (body) parameters
- **RequestBase Exclusion for Server**: Server-side handlers no longer include `RequestBase` fields (like `signal`), as these are client-only concerns

## [1.0.0-alpha.1] - 2026-01-06

### Added

- **Error Schema Support**: New `errorSchema` option for endpoints that maps HTTP status codes to Zod schemas for type-safe error handling

  ```typescript
  const getUser = api.declareEndpoint({
    method: 'GET',
    url: '/users/$userId',
    responseSchema: userSchema,
    errorSchema: {
      400: z.object({ error: z.string(), field: z.string() }),
      404: z.object({ error: z.literal('Not Found') }),
    },
  })
  ```

- **Error Type Guards**: New helper functions `isErrorStatus()` and `isErrorResponse()` for type-safe error discrimination

  ```typescript
  import { isErrorResponse, isErrorStatus } from '@navios/builder'

  const result = await getUser({ urlParams: { userId: '1' } })
  if (isErrorStatus(result, 404)) {
    // result is typed as the 404 error schema
  }
  ```

- **UnknownResponseError**: New error class thrown when `useDiscriminatorResponse` is enabled and an error response status code doesn't match any key in `errorSchema`

- **URL Parameter Schema Validation**: New `urlParamsSchema` option for runtime validation of URL parameters with Zod

  ```typescript
  const getUser = api.declareEndpoint({
    method: 'GET',
    url: '/users/$userId',
    responseSchema: userSchema,
    urlParamsSchema: z.object({
      userId: z.string().uuid(), // Validates userId is a UUID
    }),
  })
  ```

- **Per-Endpoint Client Options**: New `clientOptions` option allows configuring timeout, headers, and transformation options per endpoint

  ```typescript
  const createUser = api.declareEndpoint({
    method: 'POST',
    url: '/users',
    responseSchema: userSchema,
    clientOptions: {
      timeout: 30000,
      headers: { 'X-Custom-Header': 'value' },
      transformRequest: { skipFields: ['rawData'] },
    },
  })
  ```

- **WebSocket Support**: New `@navios/builder/socket` export provides type-safe WebSocket/Socket.IO messaging with Zod schema validation

  ```typescript
  import { declareWebSocket, socketBuilder } from '@navios/builder/socket'

  import { io } from 'socket.io-client'
  import { z } from 'zod'

  const socket = socketBuilder()
  socket.provideClient(io('ws://localhost:3000'))

  const sendMessage = socket.defineSend({
    topic: 'chat.message',
    payloadSchema: z.object({ text: z.string() }),
  })

  const onMessage = socket.defineSubscribe({
    topic: 'chat.message',
    payloadSchema: z.object({ text: z.string(), from: z.string() }),
  })
  ```

- **Server-Sent Events (SSE) Support**: New `@navios/builder/eventsource` export provides type-safe SSE event handling with Zod schema validation

  ```typescript
  import {
    declareEventSource,
    eventSourceBuilder,
  } from '@navios/builder/eventsource'

  import { z } from 'zod'

  const sse = eventSourceBuilder()
  const chatEvents = declareEventSource({
    url: '/events/$roomId',
    urlParamsSchema: z.object({ roomId: z.string() }),
  })

  const handle = chatEvents({ urlParams: { roomId: '123' } })
  sse.provideClient(handle)

  const onMessage = sse.defineEvent({
    eventName: 'message',
    payloadSchema: z.object({ text: z.string(), from: z.string() }),
  })
  ```

- **New Type Exports**:
  - `ErrorSchemaRecord` - Type for mapping status codes to Zod schemas
  - `InferErrorSchemaOutput<T>` - Infers union of error types
  - `InferErrorSchemaOutputWithStatus<T>` - Infers error types with `__status` property
  - `EndpointOptions` - Unified endpoint configuration type
  - `StreamOptions` - Unified stream configuration type
  - `ClientOptions` - Per-endpoint client configuration type

### Changed

- **Type System Refactoring**: Replaced 50+ method overloads with const generic pattern for cleaner type inference and better IDE support

- **Error Response Status Injection**: When `useDiscriminatorResponse` is enabled and `errorSchema` is defined, error responses now include a `__status` property containing the HTTP status code for runtime discrimination

- **FormData Serialization**: Enhanced `makeFormData` with support for `bigint` values and improved `toJSON()` handling

- **Request Configuration**: `makeConfig` now properly merges `clientOptions` into request config, with per-request options taking precedence

### Fixed

- **URL Parameter Binding**: Fixed edge cases in URL parameter binding with special characters

## [0.5.3] - 2026-01-02

### Added

- **POST/PUT/PATCH with Query Schema**: Added new `declareEndpoint` overload that supports `querySchema` for POST, PUT, and PATCH methods without requiring a `requestSchema`

### Changed

- **Request Type Flexibility**: Extended `NaviosZodRequest` and `EndpointFunctionArgs` to accept `ZodType` instead of only `ZodObject` for request schemas, enabling more flexible request body types

## [0.5.2] - 2025-12-21

### Changed

- **UrlParams Type Enhancement**: Added `IsServer` boolean type parameter to `UrlParams<Url, IsServer>`
  - Server-side: URL params are always `string`
  - Client-side: URL params can be `string | number`
  - Backward compatible - uses type inference when not explicitly provided

## [0.5.1] - 2025-12-20

### Fixed

- Fixed package.json exports to use correct CommonJS file extensions (`.cjs` and `.d.cts`)

### Changed

- Updated zod dev dependency from `^4.1.13` to `^4.2.1`

## [0.5.0] - 2025-12-18

### Changed

- **Removed `useWholeResponse` option**: This option was documented but never implemented. The README has been updated to reflect the actual behavior where endpoints return only the parsed response data, not the full response object.
- **Improved documentation**: Added comprehensive JSDoc comments to all public APIs including:
  - `builder` function and configuration options
  - `declareEndpoint`, `declareStream`, and `declareMultipart` methods
  - Error handling functions (`NaviosError`, `handleError`)
  - Request utilities (`bindUrlParams`, `makeConfig`, `makeFormData`)
  - Type definitions and interfaces

### Documentation

- Updated README examples to match actual API behavior
- Added detailed JSDoc comments for better IDE support and developer experience
- Clarified usage examples for discriminated unions and error handling

## [0.4.0] - Dec 13, 2025

### Breaking Changes

- **Renamed `NaviosException` to `NaviosError`**: The error class has been renamed for consistency with JavaScript naming conventions. A deprecated alias `NaviosException` is temporarily available for backward compatibility but will be removed in the next major version.

- **Renamed handler creator functions**: All handler creator functions have been renamed to use the `create*` prefix for consistency:
  - `endpointCreator` → `createEndpoint`
  - `streamCreator` → `createStream`
  - `multipartCreator` → `createMultipart`

- **Removed `utils` export path**: The `utils` module has been removed from the public API. Internal utilities are no longer directly exported.

- **Removed `exceptions` export path**: Replaced by the `errors` module.

### Added

- **New `errors` module**: Contains `NaviosError` and error handling utilities.

  ```typescript
  import { handleError, NaviosError } from '@navios/builder'
  ```

- **New `handlers` module**: Contains all handler creation functions with a unified API.

  ```typescript
  import {
    createEndpoint,
    createHandler,
    createMultipart,
    createStream,
  } from '@navios/builder'
  ```

- **New `request` module**: Contains request-related utilities.

  ```typescript
  import { bindUrlParams, makeConfig } from '@navios/builder'
  ```

- **New `createHandler` generic function**: A unified handler creation function that powers all specific handlers (endpoint, stream, multipart). It supports custom request/response transformations via options.

### Changed

- **Reorganized type exports**: Types have been split into separate files for better maintainability:
  - `types/common.mts` - Core types (`HttpMethod`, `AbstractResponse`, `AbstractRequestConfig`, `Client`)
  - `types/config.mts` - Configuration types (`BuilderConfig`, `BuilderContext`, `BaseStreamConfig`, `BaseEndpointConfig`)
  - `types/request.mts` - Request-related types (`EndpointFunctionArgs`, `NaviosZodRequest`, `UrlParams`, etc.)
  - `types/builder-instance.mts` - `BuilderInstance` interface

- **Internal file structure**: The codebase has been reorganized for better separation of concerns:
  - `/errors` - Error classes and error handling
  - `/handlers` - Handler creation functions
  - `/request` - Request configuration utilities
  - `/types` - TypeScript type definitions

### Deprecated

- **`NaviosException`**: Use `NaviosError` instead. The alias will be removed in the next major version.

### Migration Guide

1. **Update error class imports**:

   ```typescript
   // Before
   import { NaviosException } from '@navios/builder'
   catch (error) {
     if (error instanceof NaviosException) { ... }
   }

   // After
   import { NaviosError } from '@navios/builder'
   catch (error) {
     if (error instanceof NaviosError) { ... }
   }
   ```

2. **Update handler creator imports** (if using directly):

   ```typescript
   // Before
   // After
   import {
     createEndpoint,
     createMultipart,
     createStream,
     endpointCreator,
     multipartCreator,
     streamCreator,
   } from '@navios/builder'
   ```

3. **Update utility imports** (if using directly):

   ```typescript
   // Before
   // After
   import {
     bindUrlParams,
     bindUrlParams,
     makeConfig,
     makeRequestConfig,
   } from '@navios/builder'
   ```
