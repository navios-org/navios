import type { ClassType } from '@navios/core'
import type { ZodObject } from 'zod'

export const CommandMetadataKey = Symbol('CommandMetadataKey')

export interface CommandMetadata {
  path: string
  optionsSchema?: ZodObject
  customAttributes: Map<string | symbol, any>
}

export function getCommandMetadata(
  target: ClassType,
  context: ClassDecoratorContext,
  path: string,
  optionsSchema?: ZodObject,
): CommandMetadata {
  if (context.metadata) {
    const metadata = context.metadata[CommandMetadataKey] as
      | CommandMetadata
      | undefined
    if (metadata) {
      return metadata
    } else {
      const newMetadata: CommandMetadata = {
        path,
        optionsSchema,
        customAttributes: new Map<string | symbol, any>(),
      }
      context.metadata[CommandMetadataKey] = newMetadata
      // @ts-expect-error We add a custom metadata key to the target
      target[CommandMetadataKey] = newMetadata
      return newMetadata
    }
  }
  throw new Error('[Navios Commander] Wrong environment.')
}

export function extractCommandMetadata(target: ClassType): CommandMetadata {
  // @ts-expect-error We add a custom metadata key to the target
  const metadata = target[CommandMetadataKey] as CommandMetadata | undefined
  if (!metadata) {
    throw new Error(
      '[Navios Commander] Command metadata not found. Make sure to use @Command decorator.',
    )
  }
  return metadata
}

export function hasCommandMetadata(target: ClassType): boolean {
  // @ts-expect-error We add a custom metadata key to the target
  const metadata = target[CommandMetadataKey] as CommandMetadata | undefined
  return !!metadata
}
