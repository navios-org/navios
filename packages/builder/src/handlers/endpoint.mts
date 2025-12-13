import type { z } from 'zod/v4'

import type { BaseEndpointConfig, BuilderContext } from '../types/index.mjs'

import { createHandler } from './create-handler.mjs'

export function createEndpoint<Config extends BaseEndpointConfig>(
  options: Config,
  context: BuilderContext,
) {
  return createHandler<Config, z.output<Config['responseSchema']>>({
    options,
    context,
    responseSchema: options.responseSchema,
  })
}
