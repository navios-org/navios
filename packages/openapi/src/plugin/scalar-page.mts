import { getHtmlDocument } from '@scalar/core/libs/html-rendering'

import type { OpenApiDocument } from '../document/openapi-document.mjs'

export type ScalarTheme =
  | 'default'
  | 'alternate'
  | 'moon'
  | 'purple'
  | 'solarized'
  | 'bluePlanet'
  | 'saturn'
  | 'kepler'
  | 'mars'
  | 'deepSpace'
  | 'laserwave'
  | 'elysiajs'
  | 'fastify'
  | 'none'

export interface ScalarMetaData {
  title?: string
  description?: string
  ogDescription?: string
  ogTitle?: string
  ogImage?: string
  twitterCard?: string
}

/** Options of the Scalar API reference page. */
export interface ScalarOptions {
  /** @default 'default' */
  theme?: ScalarTheme
  favicon?: string
  hideDownloadButton?: boolean
  hideSearch?: boolean
  customCss?: string
  /** Meta tags of the page. `title` is also the page title. */
  metaData?: ScalarMetaData
  /** Where to load `@scalar/api-reference` from. */
  cdn?: string
}

/** Renders the HTML of the Scalar API reference page. */
export function renderScalar(
  options: ScalarOptions,
  source: { url: string } | { content: OpenApiDocument },
): string {
  return getHtmlDocument({
    ...source,
    theme: options.theme ?? 'default',
    favicon: options.favicon,
    customCss: options.customCss,
    hideDownloadButton: options.hideDownloadButton,
    hideSearch: options.hideSearch,
    metaData: options.metaData,
    cdn: options.cdn,
    pageTitle: options.metaData?.title ?? 'API Reference',
  })
}
