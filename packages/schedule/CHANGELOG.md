# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0-alpha.2] - 2026-01-07

### Dependencies

- Updated to support `@navios/core` ^1.0.0-alpha.2

## [0.9.1] - 2026-01-02

### Added

- **Legacy-Compatible Decorators**: Added new `@navios/schedule/legacy-compat` export with support for TypeScript experimental decorators
  - `@Schedulable()` - Legacy-compatible class decorator for scheduled task services
  - `@Cron()` - Legacy-compatible method decorator for cron job scheduling
  - Re-exports `Schedule` constants, metadata utilities, and `SchedulerService`

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
  - `SchedulerService` class and all methods (`register`, `getJob`, `startAll`, `stopAll`)
  - `Cron` decorator function with parameter documentation
  - `Schedulable` decorator function
  - `Schedule` enum with documentation for all constants
  - `CronOptions` interface with property descriptions

### Documentation

- Complete JSDoc comments for better IDE support and developer experience
- Enhanced type information and parameter descriptions
- Added usage examples in JSDoc comments for all public APIs
- Improved discoverability of API features through comprehensive documentation
