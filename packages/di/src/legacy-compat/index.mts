/**
 * Legacy-compatible decorators for projects that compile with TypeScript's
 * `experimentalDecorators` option.
 *
 * Use this when a project keeps `experimentalDecorators: true`, for example an
 * existing codebase or a toolchain that only emits legacy decorators. Standard
 * (TC39 Stage 3) decorators, which Node.js toolchains and Bun both support,
 * use the main entry point instead.
 */
import '../symbol-metadata.mjs'

export type { InjectableOptions } from '../decorators/injectable.mjs'
export type { FactoryOptions } from '../decorators/factory.mjs'

// Export legacy-compatible decorators
export { Injectable } from './injectable.mjs'
export { Factory } from './factory.mjs'

// Export context compatibility utilities for building custom legacy decorators
export { createClassContext, createMethodContext } from './context-compat.mjs'
