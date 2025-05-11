import type { HttpHeader } from 'fastify/types/utils.js'

import { getEndpointMetadata } from '../metadata/index.mjs'

export function Header(name: HttpHeader, value: string | number | string[]) {
  return <T extends Function>(
    target: T,
    context: ClassMethodDecoratorContext,
  ) => {
    if (context.kind !== 'method') {
      throw new Error('[Navios] Header decorator can only be used on methods.')
    }
    const metadata = getEndpointMetadata(target, context)
    metadata.headers[name] = value

    return target
  }
}
