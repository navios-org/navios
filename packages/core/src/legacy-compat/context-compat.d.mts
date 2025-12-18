/**
 * Compatibility layer for converting legacy decorator signatures to Stage 3 format.
 *
 * This module provides utilities to create mock Stage 3 decorator contexts
 * from legacy decorator arguments, and manages metadata storage using WeakMap.
 */
import type { ClassType } from '@navios/di';
/**
 * Creates a mock ClassDecoratorContext for legacy class decorators.
 */
export declare function createClassContext(target: ClassType): ClassDecoratorContext;
/**
 * Creates a mock ClassMethodDecoratorContext for legacy method decorators.
 *
 * Note: Method decorators need to share metadata with the class context
 * because endpoint metadata is stored at the class level.
 */
export declare function createMethodContext(target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor): ClassMethodDecoratorContext;
//# sourceMappingURL=context-compat.d.mts.map