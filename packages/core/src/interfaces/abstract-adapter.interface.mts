import type { ModuleMetadata } from '../metadata/index.mjs'

/**
 * Base interface for all Navios adapters (HTTP, CLI, etc.).
 *
 * Adapters implement this interface to provide runtime-specific functionality.
 * This interface defines the common lifecycle methods shared across all adapter types.
 */
export interface AbstractAdapterInterface {
  /**
   * Sets up the adapter with the provided options.
   * Called during application initialization before modules are initialized.
   */
  setupAdapter(options: unknown): Promise<void>

  /**
   * Called after all modules are loaded.
   * Adapters use this to register routes, commands, or other module-based functionality.
   */
  onModulesInit(modules: Map<string, ModuleMetadata>): Promise<void>

  /**
   * Signals that the adapter is ready to handle requests/commands.
   * Called after onModulesInit completes.
   */
  ready(): Promise<void>

  /**
   * Disposes of the adapter and cleans up resources.
   */
  dispose(): Promise<void>
}
