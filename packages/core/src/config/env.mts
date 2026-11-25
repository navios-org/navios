import { env } from 'node:process'

/**
 * Reads an integer. A variable that is missing or empty gives the default; one
 * that is not an integer throws, because it is a mistake the default would hide.
 */
export function envInt(key: keyof NodeJS.ProcessEnv, defaultValue: number): number {
  const raw = env[key]?.trim()
  if (!raw) {
    return defaultValue
  }
  const value = Number(raw)
  if (!/^[+-]?\d+$/.test(raw) || !Number.isSafeInteger(value)) {
    throw new Error(`[Navios] The environment variable ${key} is not an integer.`)
  }
  return value
}

/** Reads a string. A variable that is missing or empty gives the default. */
export function envString(key: keyof NodeJS.ProcessEnv): string | undefined
export function envString(key: keyof NodeJS.ProcessEnv, defaultValue: string): string
export function envString(
  key: keyof NodeJS.ProcessEnv,
  defaultValue: string | undefined,
): string | undefined
export function envString(key: keyof NodeJS.ProcessEnv, defaultValue?: string): string | undefined {
  return env[key] || defaultValue || undefined
}
