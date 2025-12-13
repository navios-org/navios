import type { BaseStreamConfig, BuilderContext, NaviosZodRequest } from '../types/index.mjs'

import { createHandler } from './create-handler.mjs'

export function createStream<Config extends BaseStreamConfig>(
  options: Config,
  context: BuilderContext,
) {
  return createHandler<Config, Blob>({
    options,
    context,
    transformRequest: (request: NaviosZodRequest<Config>) => ({
      responseType: 'blob',
      ...request,
    }),
    transformResponse: (data) => data as Blob,
  })
}
