import { getEndpointMetadata } from '../metadata/index.mjs'

export function HttpCode(code: number) {
  return <T extends Function>(
    target: T,
    context: ClassMethodDecoratorContext,
  ) => {
    if (context.kind !== 'method') {
      throw new Error(
        '[Navios] HttpCode decorator can only be used on methods.',
      )
    }
    const metadata = getEndpointMetadata(target, context)
    metadata.successStatusCode = code

    return target
  }
}
