# Changelog

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
