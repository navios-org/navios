import type { ClassTypeWithInstance, ScopedContainer } from '@navios/di';
import { InjectionToken } from '@navios/di';
import type { AbstractExecutionContext, CanActivate } from '../interfaces/index.mjs';
import type { ControllerMetadata, HandlerMetadata, ModuleMetadata } from '../metadata/index.mjs';
export declare class GuardRunnerService {
    private readonly logger;
    runGuards(allGuards: Set<ClassTypeWithInstance<CanActivate> | InjectionToken<CanActivate, undefined>>, executionContext: AbstractExecutionContext, context: ScopedContainer): Promise<boolean>;
    makeContext(moduleMetadata: ModuleMetadata, controllerMetadata: ControllerMetadata, endpoint: HandlerMetadata): Set<ClassTypeWithInstance<CanActivate> | InjectionToken<CanActivate, undefined>>;
}
//# sourceMappingURL=guard-runner.service.d.mts.map