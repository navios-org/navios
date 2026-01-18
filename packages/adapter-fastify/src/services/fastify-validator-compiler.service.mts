import { Injectable } from '@navios/core'
import { safeParse } from 'zod/v4/core'

import type { FastifySchemaCompiler } from 'fastify'
import type { $ZodType } from 'zod/v4/core'

@Injectable()
export class FastifyValidatorCompilerService {
  errorCompiler: FastifySchemaCompiler<$ZodType> =
    ({ schema }) =>
    (data) => {
      const result = safeParse(schema, data)
      if (result.error) {
        return {
          error: result.error,
        }
      }

      return { value: result.data }
    }
}
