import type { CanActivate } from '../index.mjs'
import type {
  ClassType,
  ClassTypeWithInstance,
  InjectionToken,
} from '../service-locator/index.mjs'

export const ModuleMetadataKey = Symbol('ControllerMetadataKey')

export interface ModuleMetadata {
  controllers: Set<ClassType>
  imports: Set<ClassType>
  guards: Set<
    ClassTypeWithInstance<CanActivate> | InjectionToken<CanActivate, undefined>
  >
  customAttributes: Map<string | symbol, any>
}

export function getModuleMetadata(
  target: ClassType,
  context: ClassDecoratorContext,
): ModuleMetadata {
  if (context.metadata) {
    const metadata = context.metadata[ModuleMetadataKey] as
      | ModuleMetadata
      | undefined
    if (metadata) {
      return metadata
    } else {
      const newMetadata: ModuleMetadata = {
        controllers: new Set<ClassType>(),
        imports: new Set<ClassType>(),
        guards: new Set<
          | ClassTypeWithInstance<CanActivate>
          | InjectionToken<CanActivate, undefined>
        >(),
        customAttributes: new Map<string | symbol, any>(),
      }
      context.metadata[ModuleMetadataKey] = newMetadata
      // @ts-expect-error We add a custom metadata key to the target
      target[ModuleMetadataKey] = newMetadata
      return newMetadata
    }
  }
  throw new Error('[Navios] Wrong environment.')
}

export function extractModuleMetadata(target: ClassType): ModuleMetadata {
  // @ts-expect-error We add a custom metadata key to the target
  const metadata = target[ModuleMetadataKey] as ModuleMetadata | undefined
  if (!metadata) {
    throw new Error(
      '[Navios] Module metadata not found. Make sure to use @Module decorator.',
    )
  }
  return metadata
}

export function hasModuleMetadata(target: ClassType): boolean {
  // @ts-expect-error We add a custom metadata key to the target
  return !!target[ModuleMetadataKey]
}
