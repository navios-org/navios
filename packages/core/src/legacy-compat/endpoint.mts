import type { BaseEndpointOptions } from '@navios/builder'

import { Endpoint as StandardEndpoint } from '../handlers/endpoint.mjs'

import type { EndpointDeclaration } from '../handlers/endpoint-declaration.mjs'
import type { MethodHandlerFunction } from '../handlers/handler-types.mjs'

import { legacy } from './legacy-decorator.mjs'

import type { StandardDecorator } from './legacy-decorator.mjs'

export function Endpoint<const Config extends BaseEndpointOptions>(
  endpoint: EndpointDeclaration<Config>,
) {
  return legacy(StandardEndpoint(endpoint) as StandardDecorator) as <
    Method extends MethodHandlerFunction<Config>,
  >(
    target: object,
    propertyKey: string | symbol,
    descriptor: TypedPropertyDescriptor<Method>,
  ) => void
}
