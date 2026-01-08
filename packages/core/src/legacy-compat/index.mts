/**
 * Legacy-compatible decorators for projects that cannot use Stage 3 decorators.
 *
 * These decorators use the TypeScript experimental decorator API and convert
 * the arguments to Stage 3 format internally.
 *
 * @example
 * ```typescript
 * import { Module, Controller, Endpoint } from '@navios/core/legacy-compat'
 *
 * @Module({
 *   controllers: [UserController],
 * })
 * export class AppModule {}
 * ```
 */

// Re-export types
export type {
  ModuleOptions,
  ControllerOptions,
  EndpointParams,
  EndpointResult,
  MultipartParams,
  MultipartResult,
  StreamParams,
} from '../decorators/index.mjs'

// Export legacy-compatible decorators (core-specific)
export {
  Module,
  Controller,
  Endpoint,
  UseGuards,
  Header,
  HttpCode,
  Multipart,
  Stream,
} from './decorators/index.mjs'

// Re-export DI decorators and context utilities from @navios/di/legacy-compat
export {
  Injectable,
  Factory,
  createClassContext,
  createMethodContext,
  type InjectableOptions,
  type FactoryOptions,
} from '@navios/di/legacy-compat'

// Export legacy-compatible AttributeFactory
export {
  AttributeFactory,
  LegacyAttributeFactory,
  type LegacyClassAttribute,
  type LegacyClassSchemaAttribute,
} from './attribute.factory.mjs'
