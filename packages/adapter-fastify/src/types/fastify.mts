import type { ScopedContainer } from '@navios/core'

declare module 'fastify' {
  interface FastifyRequest {
    scopedContainer?: ScopedContainer
  }
}
