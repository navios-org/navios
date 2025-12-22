import type { InjectableScope, InjectableType } from '../../enums/index.mjs'

/**
 * Represents the lifecycle status of an instance holder.
 */
export enum InstanceStatus {
  /** Instance has been successfully created and is ready for use */
  Created = 'created',
  /** Instance is currently being created (async initialization in progress) */
  Creating = 'creating',
  /** Instance is being destroyed (cleanup in progress) */
  Destroying = 'destroying',
  /** Instance creation failed with an error */
  Error = 'error',
}

/** Callback function for instance destruction listeners */
export type InstanceDestroyListener = () => void | Promise<void>

/**
 * Instance holder in the Creating state.
 * The instance is null while creation is in progress.
 */
export interface InstanceHolderCreating<Instance> {
  status: InstanceStatus.Creating
  name: string
  instance: null
  creationPromise: Promise<[undefined, Instance]> | null
  destroyPromise: null
  type: InjectableType
  scope: InjectableScope
  deps: Set<string>
  destroyListeners: InstanceDestroyListener[]
  createdAt: number
  /** Tracks which services this holder is currently waiting for (for circular dependency detection) */
  waitingFor: Set<string>
}

/**
 * Instance holder in the Created state.
 * The instance is available and ready for use.
 */
export interface InstanceHolderCreated<Instance> {
  status: InstanceStatus.Created
  name: string
  instance: Instance
  creationPromise: null
  destroyPromise: null
  type: InjectableType
  scope: InjectableScope
  deps: Set<string>
  destroyListeners: InstanceDestroyListener[]
  createdAt: number
  /** Tracks which services this holder is currently waiting for (for circular dependency detection) */
  waitingFor: Set<string>
}

/**
 * Instance holder in the Destroying state.
 * The instance may still be available but is being cleaned up.
 */
export interface InstanceHolderDestroying<Instance> {
  status: InstanceStatus.Destroying
  name: string
  instance: Instance | null
  creationPromise: null
  destroyPromise: Promise<void>
  type: InjectableType
  scope: InjectableScope
  deps: Set<string>
  destroyListeners: InstanceDestroyListener[]
  createdAt: number
  /** Tracks which services this holder is currently waiting for (for circular dependency detection) */
  waitingFor: Set<string>
}

/**
 * Instance holder in the Error state.
 * The instance field contains the error that occurred during creation.
 */
export interface InstanceHolderError {
  status: InstanceStatus.Error
  name: string
  instance: Error
  creationPromise: null
  destroyPromise: null
  type: InjectableType
  scope: InjectableScope
  deps: Set<string>
  destroyListeners: InstanceDestroyListener[]
  createdAt: number
  /** Tracks which services this holder is currently waiting for (for circular dependency detection) */
  waitingFor: Set<string>
}

/**
 * Holds the state of a service instance throughout its lifecycle.
 *
 * Tracks creation/destruction promises, dependency relationships,
 * destroy listeners, and current status (Creating, Created, Destroying, Error).
 */
export type InstanceHolder<Instance = unknown> =
  | InstanceHolderCreating<Instance>
  | InstanceHolderCreated<Instance>
  | InstanceHolderDestroying<Instance>
  | InstanceHolderError

