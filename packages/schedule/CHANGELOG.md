# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0] - Unreleased

Ported to `@navios/core` 2.0 and `@navios/di` 2.0.

### Changed

- **BREAKING**: `SchedulerService.register()` no longer starts jobs by itself. Jobs start when the scheduler starts: in `onApplicationBootstrap` (the end of `app.init()`), or when `start()` is called on a scheduler used without an application. A service registered after that starts immediately.
- **BREAKING**: `app.close()` now stops every job, through `onApplicationShutdown`, and waits for the runs in progress. Disposing a bare container does the same through `onServiceDestroy`. Before, jobs kept running until `stopAll()` was called.
- **BREAKING**: `@Schedulable()` no longer takes a `registry`. Registries were removed from `@navios/di`; isolation comes from using a separate `Container`. It takes `{ scope }` instead.
- Every run of a job happens in its own DI scope (`container.createScope()`), disposed after the run. A `@Schedulable({ scope: InjectableScope.Request })` class is instantiated for each run and gets `onServiceDestroy` after it; a singleton class keeps one instance, as before.
- Registering the same class twice is ignored. Before, the second registration replaced the jobs in the map and left the first ones running.
- Jobs are looked up by class, so two schedulable classes with the same name no longer overwrite each other.
- The legacy-compat entry builds its decorator contexts itself; `createClassContext` and `createMethodContext` are still exported from `@navios/schedule/legacy-compat`.
- `SchedulerService` is registered with `registerInjectable()`, so the package is built without a decorator transform.

### Added

- `SchedulerService.start()` and `SchedulerService.stop()`.
- `schedulePlugin({ services })`: registers schedulable services and ties them to the application lifecycle without writing `onModuleInit`.
- `SchedulableOptions`.

### Fixed

- The symbol behind `ScheduleMetadataKey` was described as `ControllerMetadataKey`, and the error for a class without metadata told the user to add `@Controller`. Both now name the schedule metadata and `@Schedulable`.

### Removed

- `zod` from `peerDependencies`; the package never used it.

## [1.0.0] - 2026-01-09

### Added

- **Stable Release**: First stable release of @navios/schedule
  - Production-ready task scheduling for Navios framework
  - Cron-based job scheduling with dependency injection support
  - Seamless integration with Navios modules and services

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
