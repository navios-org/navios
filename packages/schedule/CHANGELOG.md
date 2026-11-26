# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.0.0-alpha.1] - Unreleased

### Changed

- `@navios/di` is a peer dependency, beside `@navios/core`.
- The legacy `Cron` and `Schedulable` are `legacy()` of `@navios/core/legacy-compat` applied to the standard decorators. A legacy `@Cron` on a property throws the error of the standard decorator.
- **BREAKING**: `SchedulerService.prepare()` and `SchedulerService.warnAboutUnregistered()`, steps of `scheduleTransport()` that were marked internal, are no longer public methods.

## [2.0.0-alpha.0] - 2026-11-26

Ported to `@navios/core` 2.0 and `@navios/di` 2.0.

### Changed

- **BREAKING**: jobs run in an application that lists `scheduleTransport()` in its `transports`. `SchedulerService.register()` no longer starts anything by itself: jobs start with `app.start()` (or `app.listen()`), after every bootstrap hook, and `app.init()` starts none. A class registered later starts at once. A class registered on a scheduler that nothing started is a warning in the log. Without an application, call `start()`.
- **BREAKING**: `app.close()` takes every job off its schedule, aborts the signal of the runs in progress and waits for them, at most `shutdownTimeout`, before the services they use are shut down. What is still running after that is logged. A job may close the application itself. Before, jobs kept running until `stopAll()` was called.
- **BREAKING**: runs of one job no longer overlap: a tick that finds a run of the same job in progress in this process is skipped. `@Cron(expression, { overlap: 'allow' })` gives the old behaviour.
- **BREAKING**: `SchedulerService.getJob()` returns a `ScheduledJob` instead of the `CronJob` of the `cron` package, which is no longer part of the API: `active` instead of `isActive`, `nextRun` and `lastRun` instead of `nextDate()` and `lastDate()`, and `run()` instead of `fireOnTick()`, which resolves when the run has ended and rejects with its error. It only takes the names of methods that can be jobs.
- **BREAKING**: `@Cron()` takes the expression as a string only, not a `Date` or a luxon `DateTime`.
- **BREAKING**: `@Cron()` on a private (`#name`), static or symbol-named method throws, and so does a second `@Cron()` on one method. Before, the former failed on every tick and the latter silently replaced the first.
- **BREAKING**: `register()` throws for an empty cron expression, also for a `disabled` job, and for an expression that never occurs. Before, a job with an empty expression was skipped, and one that never occurs was accepted when it was disabled.
- **BREAKING**: a class that extends a `@Schedulable()` class without being decorated itself cannot be registered. Before, it was registered as its parent.
- **BREAKING**: `@Schedulable()` no longer takes a `registry`. Registries were removed from `@navios/di`; isolation comes from using a separate `Container`. It takes `{ scope }` instead.
- **BREAKING**: `@navios/schedule/legacy-compat` exports the decorators `Cron` and `Schedulable` and their types. Import everything else from `@navios/schedule`.
- Every run of a job happens in its own DI scope (`container.createScope()`), disposed after the run. A `@Schedulable({ scope: InjectableScope.Request })` class is instantiated for each run and gets `onServiceDestroy` after it; a singleton class keeps one instance, as before, which is built while the application initialises.
- Registering the same class twice is ignored. Before, the second registration replaced the jobs in the map and left the first ones running.
- Jobs are looked up by class, so two schedulable classes with the same name no longer overwrite each other.
- The `cron` package computes the times; the timers are this package's own.
- `SchedulerService` is registered with `registerInjectable()`, so the package is built without a decorator transform.

### Added

- `scheduleTransport({ services, enabled, timeZone, onError })`, for `createApplication` and `NaviosFactory.create`.
- `@Module({ jobs: [...] })`: the schedulable classes of a module. A schedulable class that the application builds but that is listed nowhere is a warning in the log.
- Jobs are called with a `JobRun`: `{ name, scheduledAt, signal }`.
- `CronOptions.overlap` and `CronOptions.timeZone`: the IANA time zone the cron expression is evaluated in, for example `@Cron('0 4 * * *', { timeZone: 'Europe/Kyiv' })`.
- `SchedulerService.start()` and `SchedulerService.stop(timeoutMs)`.
- `SchedulableOptions`.
- `@Cron()` accepts a synchronous method as well as an `async` one, whatever it returns.
- `files` in `package.json`: only `lib`, the README, the changelog and the license are published.

### Fixed

- A `@Schedulable()` class that extends another one no longer adds its jobs to the parent or shares the parent's metadata (and its name). The subclass gets its own copy of the parent's jobs and may reschedule one by decorating its override. With the legacy decorators a subclass now inherits the jobs too.
- `@Cron()` names the job after the decorated method even when a decorator applied before it replaced the function. Before, the job was keyed by the function's `name` and could not be run.
- `SchedulerService.register()` with an invalid job no longer leaves the service half registered, with a second `register()` silently ignored. Nothing is registered, and the error names the class and the method.
- A job started or run from a request no longer inherits the async context of that request.
- A failed run is one log record that names the job. Nothing is written to the console past the Navios logger.
- `repository.url` points to `navios-org/navios`.

### Removed

- `SchedulerService.startAll()` and `stopAll()`. Use `start()` and `stop()`, and `getJob()` for a disabled job.
- The exports `CronMetadataKey`, `getAllCronMetadata`, `getCronMetadata`, `CronMetadata`, `ScheduleMetadataKey`, `getScheduleMetadata`, `extractScheduleMetadata`, `hasScheduleMetadata` and `ScheduleMetadata`; from `legacy-compat` also `createClassContext` and `createMethodContext`, which `@navios/core/legacy-compat` exports.
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
