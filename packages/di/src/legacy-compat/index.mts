/**
 * Legacy-compatible decorators for projects using TypeScript experimental decorators.
 *
 * Use this when you cannot use Stage 3 decorators (e.g., existing projects with
 * experimentalDecorators enabled, certain bundler configurations, or Bun).
 */

// Re-export decorator options types
export type { InjectableOptions, FactoryOptions } from '../decorators/index.mjs'

// Export legacy-compatible decorators
export { Injectable } from './injectable.decorator.mjs'
export { Factory } from './factory.decorator.mjs'

// Export context compatibility utilities for building custom legacy decorators
export { createClassContext, createMethodContext } from './context-compat.mjs'
