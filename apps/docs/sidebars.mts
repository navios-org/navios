/**
 * Sidebars for the four documentation sections.
 *
 * Entries are page paths relative to `content/docs`, without the extension; a trailing slash means
 * the folder's `index.md`. Labels come from each page's `title` frontmatter or first heading, so a
 * page is only named in one place.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

type Entry = string | Group
interface Group {
  text: string
  collapsed: boolean
  items: Entry[]
}
type SidebarItem =
  | { text: string; link: string }
  | { text: string; collapsible: true; collapsed: boolean; items: SidebarItem[] }

const docsDir = join(import.meta.dirname, 'content/docs')

function group(text: string, items: Entry[], { collapsed = true } = {}): Group {
  return { text, collapsed, items }
}

function pageTitle(path: string): string {
  const base = join(docsDir, path)
  const file = [`${base}.md`, join(base, 'index.md')].find((candidate) => existsSync(candidate))
  if (!file) throw new Error(`sidebars.mts: no page found for "${path}"`)
  const source = readFileSync(file, 'utf8')
  const frontmatter = source.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? ''
  const title =
    frontmatter.match(/^title:\s*(.+)$/m)?.[1]?.replace(/^['"]|['"]$/g, '') ?? source.match(/^#\s+(.+)$/m)?.[1]
  if (!title) throw new Error(`sidebars.mts: "${path}" has no title frontmatter or top-level heading`)
  return title
}

function resolve(entries: Entry[]): SidebarItem[] {
  return entries.map((entry) =>
    typeof entry === 'string'
      ? { text: pageTitle(entry.replace(/\/$/, '')), link: `/docs/${entry}` }
      : { text: entry.text, collapsible: true, collapsed: entry.collapsed, items: resolve(entry.items) },
  )
}

const server: Entry[] = [
  'server/',
  group(
    'Overview',
    [
      'server/overview/why-navios',
      'server/overview/',
      'server/overview/request-lifecycle',
      'server/overview/conventions',
    ],
    { collapsed: false },
  ),
  group(
    'Guides',
    [
      'server/guides/modules',
      'server/guides/controllers',
      'server/guides/services',
      'server/guides/guards',
      'server/guides/plugins',
      'server/guides/authentication',
      'server/guides/error-handling',
      'server/guides/configuration',
      'server/guides/logging',
      'server/guides/testing',
      'server/guides/openapi',
      group(
        'OpenTelemetry',
        [
          'server/guides/otel/configuration-presets',
          'server/guides/otel/getting-started',
          'server/guides/otel/traced-decorator',
          'server/guides/otel/exporters',
          'server/guides/otel/metrics',
          'server/guides/otel/custom-spans',
        ],
        { collapsed: false },
      ),
      'server/guides/migrating-from-nestjs',
    ],
    { collapsed: false },
  ),
  group(
    'Adapters',
    [
      'server/adapters/fastify',
      'server/adapters/bun',
      'server/adapters/xml',
    ],
    { collapsed: false },
  ),
  group(
    'Advanced',
    [
      'server/advanced/attributes',
      'server/advanced/multipart',
      'server/advanced/streaming',
    ],
  ),
  group(
    'Recipes',
    [
      'server/recipes/hot-reload',
      'server/recipes/authentication',
      'server/recipes/schedule',
      'server/recipes/prisma',
    ],
  ),
  group(
    'Best Practices',
    [
      'server/best-practices/index',
    ],
  ),
  group(
    'FAQ',
    [
      'server/faq/common-problems',
    ],
  ),
]

const builder: Entry[] = [
  'builder/',
  group(
    'Builder',
    [
      'builder/builder/getting-started',
      'builder/builder/overview',
      group(
        'Guides',
        [
          'builder/builder/guides/defining-endpoints',
          'builder/builder/guides/url-parameters',
          'builder/builder/guides/query-parameters',
          'builder/builder/guides/schemas',
          'builder/builder/guides/error-handling',
          'builder/builder/guides/http-client',
        ],
      ),
      group(
        'Advanced',
        [
          'builder/builder/advanced/streams',
          'builder/builder/advanced/multipart',
          'builder/builder/advanced/websocket',
          'builder/builder/advanced/eventsource',
          'builder/builder/advanced/discriminated-unions',
          'builder/builder/advanced/custom-handlers',
        ],
      ),
      'builder/builder/api-reference',
      'builder/builder/best-practices',
    ],
    { collapsed: false },
  ),
  group(
    'React Query',
    [
      'builder/react-query/getting-started',
      'builder/react-query/overview',
      group(
        'Guides',
        [
          'builder/react-query/guides/queries',
          'builder/react-query/guides/infinite-queries',
          'builder/react-query/guides/mutations',
          'builder/react-query/guides/scoped-mutations',
          'builder/react-query/guides/file-uploads',
          'builder/react-query/guides/query-keys',
          'builder/react-query/guides/invalidation',
          'builder/react-query/guides/suspense',
          'builder/react-query/guides/mutation-context',
          'builder/react-query/guides/optimistic-updates',
        ],
      ),
      group(
        'Advanced',
        [
          'builder/react-query/advanced/file-downloads',
          'builder/react-query/advanced/ssr-prefetch',
          'builder/react-query/advanced/error-schemas',
          'builder/react-query/advanced/query-client-config',
        ],
      ),
      'builder/react-query/api-reference',
      'builder/react-query/best-practices',
      group(
        'Recipes',
        [
          'builder/react-query/recipes/complete-example',
          'builder/react-query/recipes/form-handling',
          'builder/react-query/recipes/realtime-updates',
        ],
      ),
    ],
    { collapsed: false },
  ),
]

const di: Entry[] = [
  'di/',
  group(
    'DI Core',
    [
      'di/di/overview',
      group(
        'Getting Started',
        [
          'di/di/getting-started/setup',
          'di/di/getting-started/first-service',
          'di/di/getting-started/injection-tokens',
          'di/di/getting-started/bound-factory-tokens',
          'di/di/getting-started/factories',
          'di/di/getting-started/service-override',
        ],
        { collapsed: false },
      ),
      group(
        'Architecture',
        [
          'di/di/architecture/overview',
          'di/di/architecture/core-concepts',
        ],
        { collapsed: false },
      ),
      group(
        'Guides',
        [
          'di/di/guides/services',
          'di/di/guides/factories',
          'di/di/guides/injection-tokens',
          'di/di/guides/scopes',
          'di/di/guides/lifecycle',
          'di/di/guides/request-contexts',
          'di/di/guides/circular-dependencies',
          'di/di/guides/testing',
          'di/di/guides/browser-support',
        ],
      ),
      'di/di/api-reference',
      group(
        'Recipes',
        [
          'di/di/recipes/configuration-services',
          'di/di/recipes/database-connections',
          'di/di/recipes/http-clients',
          'di/di/recipes/caching-patterns',
          'di/di/recipes/multi-tenant',
        ],
      ),
      'di/di/best-practices',
      'di/di/faq',
    ],
    { collapsed: false },
  ),
  group(
    'DI React',
    [
      'di/di-react/getting-started',
      group(
        'Guides',
        [
          'di/di-react/guides/setup',
          'di/di-react/guides/hooks',
          'di/di-react/guides/providers',
          'di/di-react/guides/scopes',
          'di/di-react/guides/invalidation',
          'di/di-react/guides/suspense',
          'di/di-react/guides/error-handling',
        ],
      ),
      'di/di-react/api-reference',
      group(
        'Recipes',
        [
          'di/di-react/recipes/form-handling',
          'di/di-react/recipes/data-fetching',
          'di/di-react/recipes/realtime-updates',
          'di/di-react/recipes/table-rows',
          'di/di-react/recipes/modal-dialogs',
          'di/di-react/recipes/multi-tenant-ui',
        ],
      ),
      'di/di-react/best-practices',
      'di/di-react/faq',
    ],
    { collapsed: false },
  ),
]

const commander: Entry[] = [
  'commander/getting-started',
  group(
    'Overview',
    [
      'commander/overview',
    ],
  ),
  group(
    'Guides',
    [
      'commander/guides/commands',
      'commander/guides/modules',
      'commander/guides/dependency-injection',
      'commander/guides/execution-context',
      'commander/guides/validation',
      'commander/guides/testing',
    ],
  ),
  'commander/api-reference',
  group(
    'Recipes',
    [
      'commander/recipes/database-commands',
      'commander/recipes/file-operations',
      'commander/recipes/api-clients',
      'commander/recipes/multi-command-workflows',
    ],
  ),
  'commander/best-practices',
]

export const sidebar = {
  '/docs/server/': resolve(server),
  '/docs/builder/': resolve(builder),
  '/docs/di/': resolve(di),
  '/docs/commander/': resolve(commander),
}
