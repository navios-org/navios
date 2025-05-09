/* eslint-disable @typescript-eslint/no-empty-object-type */

export enum ServiceLocatorInstanceHolderKind {
  Instance = 'instance',
  Factory = 'factory',
  AbstractFactory = 'abstractFactory',
}

export enum ServiceLocatorInstanceHolderStatus {
  Created = 'created',
  Creating = 'creating',
  Destroying = 'destroying',
}

export type ServiceLocatorInstanceEffect = () => void
export type ServiceLocatorInstanceDestroyListener = () => void | Promise<void>

export interface ServiceLocatorInstanceHolderCreating<Instance> {
  status: ServiceLocatorInstanceHolderStatus.Creating
  name: string
  instance: null
  creationPromise: Promise<[undefined, Instance]> | null
  destroyPromise: null
  kind: ServiceLocatorInstanceHolderKind
  effects: ServiceLocatorInstanceEffect[]
  deps: string[]
  destroyListeners: ServiceLocatorInstanceDestroyListener[]
  createdAt: number
  ttl: number
}

export interface ServiceLocatorInstanceHolderCreated<Instance> {
  status: ServiceLocatorInstanceHolderStatus.Created
  name: string
  instance: Instance
  creationPromise: null
  destroyPromise: null
  kind: ServiceLocatorInstanceHolderKind
  effects: ServiceLocatorInstanceEffect[]
  deps: string[]
  destroyListeners: ServiceLocatorInstanceDestroyListener[]
  createdAt: number
  ttl: number
}

export interface ServiceLocatorInstanceHolderDestroying<Instance> {
  status: ServiceLocatorInstanceHolderStatus.Destroying
  name: string
  instance: Instance | null
  creationPromise: null
  destroyPromise: Promise<void>
  kind: ServiceLocatorInstanceHolderKind
  effects: ServiceLocatorInstanceEffect[]
  deps: string[]
  destroyListeners: ServiceLocatorInstanceDestroyListener[]
  createdAt: number
  ttl: number
}

export type ServiceLocatorInstanceHolder<Instance = unknown> =
  | ServiceLocatorInstanceHolderCreating<Instance>
  | ServiceLocatorInstanceHolderCreated<Instance>
  | ServiceLocatorInstanceHolderDestroying<Instance>
