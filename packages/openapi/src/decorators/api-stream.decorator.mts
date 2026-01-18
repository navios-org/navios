import { AttributeFactory } from '@navios/core'
import { z } from 'zod/v4'

import { ApiStreamToken } from '../tokens/index.mjs'

const ApiStreamSchema = z.object({
  contentType: z.string(),
  description: z.string().optional(),
})

/** Options for the @ApiStream decorator, inferred from the schema */
export type ApiStreamOptions = z.infer<typeof ApiStreamSchema>

/**
 * Specifies content type and description for stream endpoints.
 *
 * Stream endpoints don't have a responseSchema, so this decorator provides
 * the necessary metadata for OpenAPI documentation.
 *
 * @param options - Stream response options
 *
 * @example
 * ```typescript
 * @Controller()
 * export class FileController {
 *   // Binary file download
 *   @Stream(downloadFile)
 *   @ApiStream({
 *     contentType: 'application/octet-stream',
 *     description: 'Download file as binary stream'
 *   })
 *   async download(params: StreamParams<typeof downloadFile>, reply: Reply) {
 *     // Stream implementation
 *   }
 * }
 *
 * @Controller()
 * export class EventController {
 *   // Server-Sent Events
 *   @Stream(streamEvents)
 *   @ApiStream({
 *     contentType: 'text/event-stream',
 *     description: 'Real-time event stream'
 *   })
 *   async stream(params: StreamParams<typeof streamEvents>, reply: Reply) {
 *     // SSE implementation
 *   }
 * }
 * ```
 */
export const ApiStream = AttributeFactory.createAttribute(ApiStreamToken, ApiStreamSchema)
