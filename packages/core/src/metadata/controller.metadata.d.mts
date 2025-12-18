import type { ClassType, ClassTypeWithInstance, InjectionToken } from '@navios/di';
import type { CanActivate } from '../interfaces/index.mjs';
import type { HandlerMetadata } from './handler.metadata.mjs';
export declare const ControllerMetadataKey: unique symbol;
export interface ControllerMetadata {
    endpoints: Set<HandlerMetadata>;
    guards: Set<ClassTypeWithInstance<CanActivate> | InjectionToken<CanActivate, undefined>>;
    customAttributes: Map<string | symbol, any>;
}
export declare function getControllerMetadata(target: ClassType, context: ClassDecoratorContext): ControllerMetadata;
export declare function extractControllerMetadata(target: ClassType): ControllerMetadata;
export declare function hasControllerMetadata(target: ClassType): boolean;
//# sourceMappingURL=controller.metadata.d.mts.map