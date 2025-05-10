import type { FastifyReply, FastifyRequest } from 'fastify'

import type { CanActivate } from '../interfaces/index.mjs'
import type {
  ControllerMetadata,
  EndpointMetadata,
  ModuleMetadata,
} from '../metadata/index.mjs'
import type { ClassTypeWithInstance } from '../service-locator/index.mjs'

import { HttpException } from '../index.mjs'
import {
  inject,
  Injectable,
  InjectionToken,
} from '../service-locator/index.mjs'

@Injectable()
export class GuardRunnerService {
  async runGuards(
    allGuards: Set<
      | ClassTypeWithInstance<CanActivate>
      | InjectionToken<CanActivate, undefined>
    >,
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    let canActivate = true
    for (const guard of Array.from(allGuards).reverse()) {
      const guardInstance = await inject(
        guard as InjectionToken<CanActivate, undefined>,
      )
      if (!guardInstance.canActivate) {
        throw new Error(
          `[Navios] Guard ${guard.name as string} does not implement canActivate()`,
        )
      }
      try {
        canActivate = await guardInstance.canActivate(request, reply)
        if (!canActivate) {
          break
        }
      } catch (error) {
        if (error instanceof HttpException) {
          reply.status(error.statusCode).send(error.response)
          return false
        } else {
          reply.status(500).send({
            message: 'Internal server error',
            error: (error as Error).message,
          })
          return false
        }
      }
    }
    if (!canActivate) {
      reply.status(403).send({
        message: 'Forbidden',
      })
      return false
    }
    return canActivate
  }

  mergeGuards(
    moduleMetadata: ModuleMetadata,
    controllerMetadata: ControllerMetadata,
    endpointMetadata: EndpointMetadata,
  ): Set<
    ClassTypeWithInstance<CanActivate> | InjectionToken<CanActivate, undefined>
  > {
    const guards = new Set<
      | ClassTypeWithInstance<CanActivate>
      | InjectionToken<CanActivate, undefined>
    >()
    if (endpointMetadata.guards) {
      for (const guard of endpointMetadata.guards) {
        guards.add(guard)
      }
    }
    if (controllerMetadata.guards) {
      for (const guard of controllerMetadata.guards) {
        guards.add(guard)
      }
    }
    if (moduleMetadata.guards) {
      for (const guard of moduleMetadata.guards) {
        guards.add(guard)
      }
    }
    return guards
  }
}
