import type { ClassType } from '@navios/core'

export const CliModuleMetadataKey = Symbol('CliModuleMetadataKey')

export interface CliModuleMetadata {
  commands: Set<ClassType>
  imports: Set<ClassType>
  customAttributes: Map<string | symbol, any>
}

export function getCliModuleMetadata(
  target: ClassType,
  context: ClassDecoratorContext,
): CliModuleMetadata {
  if (context.metadata) {
    const metadata = context.metadata[CliModuleMetadataKey] as
      | CliModuleMetadata
      | undefined
    if (metadata) {
      return metadata
    } else {
      const newMetadata: CliModuleMetadata = {
        commands: new Set<ClassType>(),
        imports: new Set<ClassType>(),
        customAttributes: new Map<string | symbol, any>(),
      }
      context.metadata[CliModuleMetadataKey] = newMetadata
      // @ts-expect-error We add a custom metadata key to the target
      target[CliModuleMetadataKey] = newMetadata
      return newMetadata
    }
  }
  throw new Error('[Navios Commander] Wrong environment.')
}

export function extractCliModuleMetadata(target: ClassType): CliModuleMetadata {
  // @ts-expect-error We add a custom metadata key to the target
  const metadata = target[CliModuleMetadataKey] as CliModuleMetadata | undefined
  if (!metadata) {
    throw new Error(
      `[Navios Commander] Module metadata not found for ${target.name}. Make sure to use @CliModule decorator.`,
    )
  }
  return metadata
}

export function hasCliModuleMetadata(target: ClassType): boolean {
  // @ts-expect-error We add a custom metadata key to the target
  return !!target[CliModuleMetadataKey]
}
