import type { HttpHeader } from 'fastify/types/utils.js'

import { EndpointType, getEndpointMetadata } from '../metadata/index.mjs'

export function Header(name: HttpHeader, value: string | number | string[]) {
  return <T extends Function>(
    target: T,
    context: ClassMethodDecoratorContext,
  ) => {
    if (context.kind !== 'method') {
      throw new Error('[Navios] Header decorator can only be used on methods.')
    }
    const metadata = getEndpointMetadata(target, context)
    if (metadata.type === EndpointType.Stream) {
      throw new Error(
        '[Navios] HttpCode decorator cannot be used on stream endpoints.',
      )
    }

    metadata.headers[name] = value

    return target
  }
}
