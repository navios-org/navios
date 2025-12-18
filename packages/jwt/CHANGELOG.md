# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
