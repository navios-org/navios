import { DatabaseSync } from 'node:sqlite'

import type { BetterAuthOptions } from 'better-auth'

export const SECRET = 'a-test-secret-that-is-long-enough-for-better-auth'

/** Options every test instance shares: an in-memory database and no telemetry. */
export function testOptions() {
  return {
    database: new DatabaseSync(':memory:'),
    secret: SECRET,
    baseURL: 'http://localhost',
    telemetry: { enabled: false },
    emailAndPassword: { enabled: true },
    logger: { disabled: true },
  } satisfies BetterAuthOptions
}

/**
 * Creates Better Auth's tables. Typed by what it uses: an `Auth<Options>` is not an `Auth`,
 * because its options are invariant.
 */
export async function migrate(auth: {
  $context: Promise<{ runMigrations(): Promise<void> }>
}): Promise<void> {
  const context = await auth.$context
  await context.runMigrations()
}
