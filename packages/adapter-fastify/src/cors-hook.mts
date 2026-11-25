import cors from '@fastify/cors'

import type { FastifyCorsOptions } from '@fastify/cors'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

/* eslint-disable @typescript-eslint/no-explicit-any */

export type CorsHook = (
  request: FastifyRequest,
  reply: FastifyReply,
  done: (error?: unknown) => void,
) => void

/** What `@fastify/cors` does with a request, for one that no hook sees. */
export function corsHook(server: FastifyInstance, options: FastifyCorsOptions): CorsHook {
  let hook: CorsHook
  // Next to its hook, the plugin adds a route and a decorator, which are there already.
  const instance = Object.assign(Object.create(server), {
    addHook: (_name: string, added: CorsHook) => (hook = added),
    options() {},
    decorateRequest() {},
  })
  ;(cors as any)(instance, { ...options, hook: 'onRequest' }, () => {})
  return hook!
}
