import type { ClassTypeWithInstance } from '@navios/di'

import { Container, inject, Injectable, InjectionToken } from '@navios/di'

import type {
  AbstractExecutionContext,
  CanActivate,
} from '../interfaces/index.mjs'
import type {
  ControllerMetadata,
  HandlerMetadata,
  ModuleMetadata,
} from '../metadata/index.mjs'

import { HttpException } from '../exceptions/index.mjs'

@Injectable()
export class GuardRunnerService {
  protected container = inject(Container)
  async runGuards(
    allGuards: Set<
      | ClassTypeWithInstance<CanActivate>
      | InjectionToken<CanActivate, undefined>
    >,
    executionContext: AbstractExecutionContext,
  ) {
    let canActivate = true
    for (const guard of Array.from(allGuards).reverse()) {
      const guardInstance = await this.container.get(
        guard as InjectionToken<CanActivate, undefined>,
      )
      if (!guardInstance.canActivate) {
        throw new Error(
          `[Navios] Guard ${guard.name as string} does not implement canActivate()`,
        )
      }
      try {
        canActivate = await guardInstance.canActivate(executionContext)
        if (!canActivate) {
          break
        }
      } catch (error) {
        if (error instanceof HttpException) {
          executionContext
            .getReply()
            .status(error.statusCode)
            .send(error.response)
          return false
        } else {
          executionContext
            .getReply()
            .status(500)
            .send({
              message: 'Internal server error',
              error: (error as Error).message,
            })
          return false
        }
      }
    }
    if (!canActivate) {
      executionContext.getReply().status(403).send({
        message: 'Forbidden',
      })
      return false
    }
    return canActivate
  }

  makeContext(
    moduleMetadata: ModuleMetadata,
    controllerMetadata: ControllerMetadata,
    endpoint: HandlerMetadata,
  ): Set<
    ClassTypeWithInstance<CanActivate> | InjectionToken<CanActivate, undefined>
  > {
    const guards = new Set<
      | ClassTypeWithInstance<CanActivate>
      | InjectionToken<CanActivate, undefined>
    >()
    const endpointGuards = endpoint.guards
    const controllerGuards = controllerMetadata.guards
    const moduleGuards = moduleMetadata.guards
    if (endpointGuards.size > 0) {
      for (const guard of endpointGuards) {
        guards.add(guard)
      }
    }
    if (controllerGuards.size > 0) {
      for (const guard of controllerGuards) {
        guards.add(guard)
      }
    }
    if (moduleGuards.size > 0) {
      for (const guard of moduleGuards) {
        guards.add(guard)
      }
    }
    return guards
  }
}
