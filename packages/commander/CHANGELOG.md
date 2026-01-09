# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0-alpha.4] - 2026-01-09

### Added

- **Unified Adapter Architecture**: Commander now uses the unified adapter system from `@navios/core`
  - `CommanderAdapterService` implements `AbstractCliAdapterInterface` with standard lifecycle methods
  - `AbstractCliAdapterInterface` extends `AbstractAdapterInterface` with CLI-specific methods (`run`, `executeCommand`, `getAllCommands`)
  - `CliEnvironment` interface for type-safe CLI configuration
  - `defineCommanderEnvironment()` function for creating CLI adapter environments
- **Command Description Support**: Commands now support `description` property for help text
  - `@Command({ path: 'greet', description: 'Greet a user' })`
  - Descriptions displayed in `--help` output
- **Built-in Help Command**: Automatic `help` command with `--help` flag support
  - Shows all available commands with descriptions
  - Per-command help with option details from Zod schema metadata
  - Supports `.meta({ description: '...' })` on Zod fields for option descriptions
- **Command Registry Service**: New `CommandRegistryService` for managing registered commands
  - Replaces module-level command tracking
  - Provides `register()`, `getByPath()`, `getAllAsArray()`, and `clear()` methods
- **Module Custom Entries**: Commands are now registered via `customEntries` in module metadata
  - `@CliModule({ commands: [...] })` stores commands in `customEntries` Map
  - Adapter discovers commands via `CommandEntryKey` in module metadata

### Changed

- **Factory Returns NaviosApplication**: `CommanderFactory.create()` now returns `NaviosApplication` instead of `CommanderApplication`
  - Use `app.getAdapter()` to access CLI-specific methods
  - Aligns with HTTP adapter pattern for consistency
- **CLI Module Decorator**: `@CliModule()` now extends `@Module()` with command registration
  - Commands are added to `customEntries` instead of separate metadata
  - Module imports and providers work the same as `@Module()`
- **Command Decorator**: Now stores metadata using standard Navios metadata system
  - Metadata includes `description` field for help text
- **Application Lifecycle**: Uses standard `NaviosApplication` lifecycle
  - `app.init()` initializes modules and adapter
  - `app.getAdapter().run()` executes CLI commands
  - `app.close()` disposes resources

### Removed

- **CommanderApplication Class**: Replaced by `NaviosApplication` with CLI adapter
- **CliModuleLoaderService**: Replaced by `CommanderAdapterService.onModulesInit()`
- **CliModuleMetadata**: Module metadata now uses standard `ModuleMetadata` with `customEntries`

### Breaking Changes

- **Factory Return Type**: `CommanderFactory.create()` returns `NaviosApplication` instead of `CommanderApplication`
  - Before: `const app = await CommanderFactory.create(AppModule); await app.run()`
  - After: `const app = await CommanderFactory.create(AppModule); await app.init(); await app.getAdapter().run()`
- **Method Access**: CLI methods accessed via `app.getAdapter()` instead of directly on app
  - Before: `app.executeCommand('greet', opts)`
  - After: `app.getAdapter().executeCommand('greet', opts)`
- **Module Decorator**: `@CliModule()` decorator signature unchanged but internal metadata format changed

### Dependencies

- Updated to support `@navios/core` ^1.0.0-alpha.4

## [1.0.0-alpha.2] - 2026-01-07

### Added

- **Module Overrides**: New `overrides` option in `@CliModule()` decorator for service override classes
  - Service override classes are imported for side effects to ensure their `@Injectable` decorators execute
  - Overrides should use the same `InjectionToken` as the original service with a higher priority
  - `CliModuleLoaderService` validates overrides and logs warnings if override is not active or not registered
  - Mirrors the same functionality as `@Module()` in `@navios/core`
- **Logger Integration**: `CliModuleLoaderService` now uses the `Logger` service for consistent logging

### Dependencies

- Updated to support `@navios/core` ^1.0.0-alpha.2

## [0.9.0] - 2025-12-23

### Dependencies

- Updated to support `@navios/di` ^0.9.0

## [0.8.0] - 2025-12-21

### Dependencies

- Updated to support `@navios/di` ^0.8.0

## [0.7.1] - 2025-12-20

### Fixed

- Fixed package.json exports to use correct CommonJS file extensions (`.cjs` and `.d.cts`)

## [0.7.0] - 2025-12-18

### Added

- **Comprehensive JSDoc Documentation**: Added detailed JSDoc comments to all public APIs including:
  - `CommanderFactory` class and `create` method
  - `CommanderApplication` class and all methods (`init`, `run`, `executeCommand`, `getAllCommands`, `getContainer`, `close`)
  - `Command` decorator function and `CommandOptions` interface
  - `CliModule` decorator function and `CliModuleOptions` interface
  - `CommandHandler` interface with generic type parameter
  - `CommanderExecutionContext` class and all methods (`getCommand`, `getCommandPath`, `getOptions`)
  - `CommandExecutionContext` injection token
  - `CommandMetadata` and `CliModuleMetadata` interfaces
  - Metadata utility functions (`getCommandMetadata`, `extractCommandMetadata`, `hasCommandMetadata`, `getCliModuleMetadata`, `extractCliModuleMetadata`, `hasCliModuleMetadata`)
  - `CliParserService` class and `ParsedCliArgs` interface
  - `CliModuleLoaderService` class and `CommandWithMetadata` interface

### Documentation

- Complete JSDoc comments for better IDE support and developer experience
- Enhanced type information and parameter descriptions
- Added usage examples in JSDoc comments for all public APIs
- Improved discoverability of API features through comprehensive documentation
- Updated README to accurately reflect the ExecutionContext API
