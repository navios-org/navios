import type { BaseEndpointConfig } from '@navios/navios-zod'
import type { HttpMethod } from 'navios'

import type { ClassType } from '../service-locator/injection-token.mjs'

import { InjectableScope } from '../service-locator/enums/injectable-scope.enum.mjs'
import { Injectable, InjectableType } from '../service-locator/index.mjs'
import { InjectionToken } from '../service-locator/injection-token.mjs'
import {
  getServiceLocator,
  provideServiceLocator,
} from '../service-locator/injector.mjs'
import { makeProxyServiceLocator } from '../service-locator/proxy-service-locator.mjs'
import { EndpointMetadataKey } from './endpoint.decorator.mjs'

export const ControllerMetadataKey = Symbol('ControllerMetadataKey')

export interface ControllerMetadata {
  endpoints: Map<
    string,
    Map<
      HttpMethod,
      {
        method: string
        config: BaseEndpointConfig
      }
    >
  >
}

export function Controller() {
  return function (target: ClassType, context: ClassDecoratorContext) {
    if (context.kind !== 'class') {
      throw new Error(
        '[Navios] @Controller decorator can only be used on classes.',
      )
    }
    const token = InjectionToken.create(target)
    if (context.metadata) {
      const endpointMetadata = context.metadata[EndpointMetadataKey] as
        | Map<
            string,
            Map<
              HttpMethod,
              {
                method: string
                config: BaseEndpointConfig
              }
            >
          >
        | undefined
      // @ts-expect-error We add a custom metadata key to the target
      target[ControllerMetadataKey] = {
        endpoints:
          endpointMetadata ??
          new Map<
            string,
            Map<
              HttpMethod,
              {
                method: string
                config: BaseEndpointConfig
              }
            >
          >(),
      } satisfies ControllerMetadata
    }
    return Injectable({
      token,
      type: InjectableType.Class,
      scope: InjectableScope.Instance,
    })(target, context)
  }
}

export function getControllerMetadata(target: ClassType): ControllerMetadata {
  // @ts-expect-error We add a custom metadata key to the target
  const metadata = target[ControllerMetadataKey]
  if (!metadata) {
    throw new Error('[Navios] @Controller decorator is not used on this class.')
  }
  return metadata
}
