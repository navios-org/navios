import type { ZodType } from 'zod/v4'
import type { oas31 } from 'zod-openapi'

import { Injectable } from '@navios/core'
import { createSchema } from 'zod-openapi'

type SchemaObject = oas31.SchemaObject
type ReferenceObject = oas31.ReferenceObject

/**
 * Result of schema conversion
 */
export interface SchemaConversionResult {
  schema: SchemaObject | ReferenceObject
  components: Record<string, SchemaObject>
}

/**
 * Service responsible for converting Zod schemas to OpenAPI schemas.
 *
 * Uses zod-openapi library which supports Zod 4's native `.meta()` method
 * for OpenAPI-specific metadata.
 */
@Injectable()
export class SchemaConverterService {
  /**
   * Converts a Zod schema to an OpenAPI schema object.
   *
   * @param schema - Zod schema to convert
   * @returns OpenAPI schema object with any component schemas
   *
   * @example
   * ```typescript
   * const userSchema = z.object({
   *   id: z.string().meta({ openapi: { example: 'usr_123' } }),
   *   name: z.string(),
   * })
   *
   * const result = schemaConverter.convert(userSchema)
   * // { schema: { type: 'object', properties: { ... } }, components: {} }
   * ```
   */
  convert(schema: ZodType): SchemaConversionResult {
    return createSchema(schema)
  }

  /**
   * Checks if a schema property represents a File type.
   *
   * Used for multipart form handling to convert File types to binary format.
   *
   * @param schema - Schema object to check
   * @returns true if the schema represents a file
   */
  isFileSchema(schema: SchemaObject): boolean {
    return schema.type === 'string' && schema.format === 'binary'
  }

  /**
   * Transforms schema properties to handle File/Blob types for multipart.
   *
   * Converts File types to OpenAPI binary format and handles arrays of files.
   *
   * @param properties - Schema properties object
   * @returns Transformed properties with file types as binary
   */
  transformFileProperties(
    properties: Record<string, SchemaObject>,
  ): Record<string, SchemaObject> {
    const result: Record<string, SchemaObject> = {}

    for (const [key, prop] of Object.entries(properties)) {
      if (this.isFileSchema(prop)) {
        result[key] = {
          type: 'string',
          format: 'binary',
          description: prop.description,
        }
      } else if (
        prop.type === 'array' &&
        prop.items &&
        this.isFileSchema(prop.items as SchemaObject)
      ) {
        result[key] = {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          description: prop.description,
        }
      } else {
        result[key] = prop
      }
    }

    return result
  }
}
