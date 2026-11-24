import type { BaseEndpointOptions } from '@navios/builder'
import type { ZodObject, ZodType } from 'zod/v4'

/**
 * Endpoint schema slots narrowed to Zod.
 *
 * `@navios/builder` accepts any Standard Schema. The server side (controllers,
 * adapters, OpenAPI generation) reads Zod schemas directly, so it constrains
 * its endpoints with this shape rather than the vendor-neutral one.
 */
export interface ZodSchemaSlots {
  querySchema?: ZodObject
  requestSchema?: ZodType
  responseSchema?: ZodType
  /**
   * Per-status success schemas; `null` marks a status without a body. Takes
   * the place of `responseSchema`.
   */
  responses?: Record<number, ZodType | null>
  errorSchema?: Record<number, ZodType>
  urlParamsSchema?: ZodObject
}

/**
 * The builder's `BaseEndpointOptions` with every schema slot narrowed to Zod.
 * This is the shape of the `config` the server-side packages work with.
 */
export interface ZodBaseEndpointOptions
  extends Omit<BaseEndpointOptions, keyof ZodSchemaSlots>, ZodSchemaSlots {}

/**
 * {@link ZodBaseEndpointOptions} with a required `responseSchema`: a JSON
 * endpoint whose reply is described by one schema.
 */
export interface ZodEndpointOptions extends ZodBaseEndpointOptions {
  responseSchema: NonNullable<ZodSchemaSlots['responseSchema']>
}
