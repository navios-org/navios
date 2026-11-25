/**
 * Decorators for projects that keep `experimentalDecorators: true`
 * (TypeScript legacy decorators). Projects that use standard decorators,
 * including under Bun, use the main entry point instead.
 *
 * Each one adapts the legacy decorator signature and calls the same
 * implementation as the standard decorator of the same name, so behaviour is
 * identical.
 */
import '../application/http-module-options.mjs'

export * from '@navios/core/legacy-compat'
export type { ControllerOptions } from '../controllers/controller.mjs'
export { Controller } from './controller.mjs'
export { Endpoint } from './endpoint.mjs'
