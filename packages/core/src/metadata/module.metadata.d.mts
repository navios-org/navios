import type { ClassType, ClassTypeWithInstance, InjectionToken } from '@navios/di';
import type { CanActivate } from '../index.mjs';
export declare const ModuleMetadataKey: unique symbol;
export interface ModuleMetadata {
    controllers: Set<ClassType>;
    imports: Set<ClassType>;
    guards: Set<ClassTypeWithInstance<CanActivate> | InjectionToken<CanActivate, undefined>>;
    customAttributes: Map<string | symbol, any>;
}
export declare function getModuleMetadata(target: ClassType, context: ClassDecoratorContext): ModuleMetadata;
export declare function extractModuleMetadata(target: ClassType): ModuleMetadata;
export declare function hasModuleMetadata(target: ClassType): boolean;
//# sourceMappingURL=module.metadata.d.mts.map