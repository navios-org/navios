import { env } from 'node:process'

export function envInt(
  key: keyof NodeJS.ProcessEnv,
  defaultValue: number,
): number {
  const envKey = env[key] || process.env[key]

  return envKey ? parseInt(envKey as string, 10) : defaultValue
}

export function envString<
  DefaultValue extends string | undefined,
  Ensured = DefaultValue extends string ? true : false,
>(
  key: keyof NodeJS.ProcessEnv,
  defaultValue?: DefaultValue,
): Ensured extends true ? string : string | undefined {
  return (env[key] ||
    process.env[key] ||
    defaultValue ||
    undefined) as Ensured extends true ? string : string | undefined
}
