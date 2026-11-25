export interface OnModuleInit {
  onModuleInit(): void | Promise<void>
}

export interface OnApplicationBootstrap {
  onApplicationBootstrap(): void | Promise<void>
}

export interface OnApplicationShutdown {
  onApplicationShutdown(signal?: string): void | Promise<void>
}

/**
 * Whether an object or its class declares a hook. The property is looked up and
 * not read: a proxy may answer for every name, or throw for one it does not know.
 */
export function declaresHook(instance: unknown, name: string): boolean {
  if ((typeof instance !== 'object' && typeof instance !== 'function') || instance === null) {
    return false
  }
  try {
    for (let at: object | null = instance; at !== null; at = Reflect.getPrototypeOf(at)) {
      const declared = Reflect.getOwnPropertyDescriptor(at, name)
      if (declared !== undefined) {
        return declared.get !== undefined || typeof declared.value === 'function'
      }
    }
  } catch {
    // A proxy that does not even let itself be looked at.
  }
  return false
}
