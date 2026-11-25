import { env } from 'node:process'

export function envInt(key: keyof NodeJS.ProcessEnv, defaultValue: number): number {
  const raw = env[key]
  if (!raw) {
    return defaultValue
  }
  const value = parseInt(raw, 10)
  return Number.isNaN(value) ? defaultValue : value
}

export function envString<
  DefaultValue extends string | undefined,
  Ensured = DefaultValue extends string ? true : false,
>(
  key: keyof NodeJS.ProcessEnv,
  defaultValue?: DefaultValue,
): Ensured extends true ? string : string | undefined {
  return (env[key] || defaultValue || undefined) as Ensured extends true
    ? string
    : string | undefined
}
