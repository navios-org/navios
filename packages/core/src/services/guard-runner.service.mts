import type { ClassTypeWithInstance, ScopedContainer } from '@navios/di'

import { inject, Injectable, InjectionToken } from '@navios/di'

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
import { Logger } from '../logger/index.mjs'

@Injectable()
export class GuardRunnerService {
  private readonly logger = inject(Logger, {
    context: GuardRunnerService.name,
  })

  /**
   * Runs guards that need to be resolved from a scoped container.
   * Use this when guards have request-scoped dependencies.
   */
  async runGuards(
    allGuards: Set<
      | ClassTypeWithInstance<CanActivate>
      | InjectionToken<CanActivate, undefined>
    >,
    executionContext: AbstractExecutionContext,
    context: ScopedContainer,
  ) {
    // Reverse order: module guards run first, then controller, then endpoint
    const guardsArray = Array.from(allGuards).reverse()

    // Resolve all guards in parallel
    const guardInstances = await Promise.all(
      guardsArray.map(async (guard) => {
        const guardInstance = await context.get(
          guard as InjectionToken<CanActivate, undefined>,
        )
        if (!guardInstance.canActivate) {
          throw new Error(
            `[Navios] Guard ${guard.name as string} does not implement canActivate()`,
          )
        }
        return guardInstance
      }),
    )

    return this.executeGuards(guardInstances, executionContext)
  }

  /**
   * Runs pre-resolved guard instances.
   * Use this when all guards are singletons and have been pre-resolved at startup.
   */
  async runGuardsStatic(
    guardInstances: CanActivate[],
    executionContext: AbstractExecutionContext,
  ) {
    return this.executeGuards(guardInstances, executionContext)
  }

  /**
   * Shared guard execution logic.
   * Iterates through guard instances and calls canActivate on each.
   */
  private async executeGuards(
    guardInstances: CanActivate[],
    executionContext: AbstractExecutionContext,
  ): Promise<boolean> {
    let canActivate = true
    for (const guardInstance of guardInstances) {
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
          this.logger.error('Error running guard', error)
          executionContext.getReply().status(500).send({
            message: 'Internal server error',
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
