import type { BaseMessageConfig } from '@navios/queues'
import type { z } from 'zod/v4'

/* eslint-disable @typescript-eslint/no-explicit-any */

type AnyDeclaration = { config: BaseMessageConfig<any, any, any> }

/**
 * What a message handler receives: the payload after validation.
 */
export type MessageParams<Declaration extends AnyDeclaration> = {
  payload: z.output<Declaration['config']['payloadSchema']>
}

/**
 * What a message handler returns: the reply of a request-reply message,
 * nothing otherwise.
 */
export type MessageResult<Declaration extends AnyDeclaration> =
  Declaration['config']['responseSchema'] extends z.ZodType
    ? Promise<z.input<Declaration['config']['responseSchema']>>
    : Promise<void>
