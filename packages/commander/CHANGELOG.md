# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

