import type { Path, PathValue } from './types.mjs'

export interface ConfigServiceInterface<Config = Record<string, unknown>> {
  getConfig: () => Config
  get: <Key extends Path<Config>>(key: Key) => PathValue<Config, Key> | null

  getOrDefault: <Key extends Path<Config>>(
    key: Key,
    defaultValue: PathValue<Config, Key>,
  ) => PathValue<Config, Key>

  getOrThrow: <Key extends Path<Config>>(
    key: Key,
    errorMessage?: string,
  ) => PathValue<Config, Key>
}
