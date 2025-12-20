import { z } from 'zod'

/**
 * Zod schema for Scalar UI theme options
 */
export const scalarThemeSchema = z.enum([
  'default',
  'alternate',
  'moon',
  'purple',
  'solarized',
  'bluePlanet',
  'saturn',
  'kepler',
  'mars',
  'deepSpace',
  'laserwave',
  'elysiajs',
  'fastify',
  'none',
])

/**
 * Zod schema for Scalar UI metadata
 */
export const scalarMetaDataSchema = z
  .object({
    title: z.string().optional(),
    description: z.string().optional(),
    ogDescription: z.string().optional(),
    ogTitle: z.string().optional(),
    ogImage: z.string().optional(),
    twitterCard: z.string().optional(),
  })
  .optional()

/**
 * Zod schema for Scalar UI configuration options
 */
export const scalarOptionsSchema = z.object({
  /**
   * Theme for Scalar UI
   * @default 'default'
   */
  theme: scalarThemeSchema.optional(),

  /**
   * Custom favicon URL
   */
  favicon: z.string().optional(),

  /**
   * Custom logo URL
   */
  logo: z.string().optional(),

  /**
   * Hide the "Download OpenAPI Spec" button
   * @default false
   */
  hideDownloadButton: z.boolean().optional(),

  /**
   * Hide the "Search" input
   * @default false
   */
  hideSearch: z.boolean().optional(),

  /**
   * Custom CSS to inject
   */
  customCss: z.string().optional(),

  /**
   * Meta data for the HTML page
   */
  metaData: scalarMetaDataSchema,

  /**
   * CDN URL for Scalar API Reference
   * @default 'https://cdn.jsdelivr.net/npm/@scalar/api-reference'
   */
  cdn: z.string().optional(),
})

/**
 * Zod schema for Bun OpenAPI plugin options
 */
export const bunOpenApiPluginOptionsSchema = z.object({
  /**
   * Path to serve OpenAPI JSON
   * @default '/openapi.json'
   */
  jsonPath: z.string().optional().default('/openapi.json'),

  /**
   * Path to serve OpenAPI YAML
   * @default '/openapi.yaml'
   */
  yamlPath: z.string().optional().default('/openapi.yaml'),

  /**
   * Path to serve Scalar UI
   * @default '/docs'
   */
  docsPath: z.string().optional().default('/docs'),

  /**
   * Scalar UI configuration
   */
  scalar: scalarOptionsSchema.optional(),

  /**
   * Disable JSON endpoint
   * @default false
   */
  disableJson: z.boolean().optional().default(false),

  /**
   * Disable Scalar UI (only serve JSON/YAML)
   * @default false
   */
  disableScalar: z.boolean().optional().default(false),

  /**
   * Disable YAML endpoint
   * @default true
   */
  disableYaml: z.boolean().optional().default(true),
})

export type ScalarTheme = z.infer<typeof scalarThemeSchema>
export type ScalarMetaData = z.infer<typeof scalarMetaDataSchema>
export type ScalarOptions = z.infer<typeof scalarOptionsSchema>
export type BunOpenApiPluginOptionsBase = z.infer<typeof bunOpenApiPluginOptionsSchema>
