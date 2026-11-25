/**
 * Decorators for projects that keep `experimentalDecorators: true`
 * (TypeScript legacy decorators). Projects that use standard decorators,
 * including under Bun, use the main entry point instead.
 *
 * Each one adapts the legacy decorator signature and calls the same
 * implementation as the standard decorator of the same name, so behaviour is
 * identical.
 */
export {
  createClassContext,
  createMethodContext,
  Factory,
  Injectable,
} from '@navios/di/legacy-compat'
export type { ControllerOptions } from '../controllers/controller.mjs'
export type { ModuleOptions } from '../modules/module.mjs'
export { AttributeFactory } from './attribute-factory.mjs'
export type {
  LegacyAttributeApplication,
  LegacyClassAttribute,
  LegacyClassSchemaAttribute,
} from './attribute-factory.mjs'
export { Controller } from './controller.mjs'
export { Endpoint } from './endpoint.mjs'
export { Module } from './module.mjs'
export { UseGuards } from './use-guards.mjs'
export { UseInterceptors } from './use-interceptors.mjs'
