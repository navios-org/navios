import { z } from 'zod/v4'

const BetterAuthConfigSchema = z.object({
  name: z.literal('@navios/better-auth'),
  options: z
    .object({
      authService: z.string().default('./src/auth/auth.providers.ts'),
      authServiceExport: z.string().default('AuthService'),
      dbAdapter: z.enum(['prisma', 'kysely', 'drizzle']),
      schemaLocation: z.string().default('./prisma/schema.prisma').optional(),
      modelsFolder: z.string().optional(),
    })
    .refine((data) => data.dbAdapter !== 'prisma' || !!data.schemaLocation, {
      message: "schemaLocation is required when dbAdapter is 'prisma'",
    }),
})

export type BetterAuthConfig = z.infer<typeof BetterAuthConfigSchema>

export const ConfigSchema = z.object({
  name: z.string().default('navios'),
  appPath: z.string().default('./src/main.ts'),
  appExport: z.string().default('app'),
  port: z.number().default(4800),
  host: z.string().default('0.0.0.0'),
  plugins: z.array(BetterAuthConfigSchema).optional(),
})

export type Config = z.infer<typeof ConfigSchema>
