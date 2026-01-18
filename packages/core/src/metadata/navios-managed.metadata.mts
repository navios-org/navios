import type { ClassType } from '@navios/di'

/**
 * Symbol used to identify Navios-managed classes (Controller, Module, MessageController, etc.).
 * This allows AttributeFactory to work with any Navios-managed class type generically.
 */
export const NaviosManagedMetadataKey = Symbol('NaviosManagedMetadataKey')

/**
 * Interface for metadata that has custom attributes.
 * Used by Navios-managed classes (Controller, Module, MessageController, etc.).
 */
export interface ManagedMetadata {
  customAttributes: Map<string | symbol, any>
}

/**
 * Gets managed metadata from a class if it exists.
 * This is a generic function that works with any Navios-managed class type.
 *
 * @param target - The class to check
 * @returns The metadata with customAttributes, or null if not managed
 */
export function getManagedMetadata(target: ClassType): ManagedMetadata | null {
  // @ts-expect-error - Checking for managed metadata key
  if (target[NaviosManagedMetadataKey]) {
    // @ts-expect-error - Accessing managed metadata
    return target[NaviosManagedMetadataKey] as ManagedMetadata
  }
  return null
}

/**
 * Checks if a class is Navios-managed (has managed metadata).
 *
 * @param target - The class to check
 * @returns true if the class is Navios-managed
 */
export function hasManagedMetadata(target: ClassType): boolean {
  return getManagedMetadata(target) !== null
}
