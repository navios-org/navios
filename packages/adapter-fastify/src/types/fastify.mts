import type { ScopedContainer } from '@navios/di'

declare module 'fastify' {
  interface FastifyRequest {
    scopedContainer?: ScopedContainer
  }
}
