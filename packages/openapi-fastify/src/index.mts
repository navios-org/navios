/**
 * @deprecated `@navios/openapi` serves the document and the Scalar page on
 * every adapter. Import `openApiPlugin` from `@navios/openapi` instead; this
 * package only re-exports it.
 */
import type { OpenApiPluginOptions } from '@navios/openapi'

export * from '@navios/openapi'

/** @deprecated Use `OpenApiPluginOptions` from `@navios/openapi`. */
export type FastifyOpenApiPluginOptions = OpenApiPluginOptions
