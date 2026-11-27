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
    frontmatter.match(/^title:\s*(.+)$/m)?.[1]?.replace(/^['"]|['"]$/g, '') ??
    source.match(/^#\s+(.+)$/m)?.[1]
  if (!title)
    throw new Error(`sidebars.mts: "${path}" has no title frontmatter or top-level heading`)
  return title
}

function resolve(entries: Entry[]): SidebarItem[] {
  return entries.map((entry) =>
    typeof entry === 'string'
      ? { text: pageTitle(entry.replace(/\/$/, '')), link: `/docs/${entry}` }
      : {
          text: entry.text,
          collapsible: true,
          collapsed: entry.collapsed,
          items: resolve(entry.items),
        },
  )
}

const server: Entry[] = [
  'server/',
  'server/quick-start',
  'server/request-lifecycle',
  'server/performance',
  group(
    'Essentials',
    [
      'server/essentials/controllers',
      'server/essentials/request-context',
      'server/essentials/services',
      'server/essentials/modules',
      'server/essentials/guards-and-interceptors',
      'server/essentials/errors',
      'server/essentials/application',
      'server/essentials/config-and-logging',
      'server/essentials/testing',
    ],
    { collapsed: false },
  ),
  group(
    'Guides',
    [
      'server/guides/authentication',
      'server/guides/request-state',
      'server/guides/file-uploads',
      'server/guides/streams-and-sse',
      'server/guides/scheduled-jobs',
      'server/guides/openapi',
      'server/guides/attributes',
      'server/guides/plugins',
      'server/guides/other-transports',
      'server/guides/prisma',
    ],
    { collapsed: false },
  ),
  group('Adapters', [
    'server/adapters/fastify',
    'server/adapters/bun',
    'server/adapters/srvx',
    'server/adapters/xml',
    'server/adapters/writing-an-adapter',
  ]),
  group('OpenTelemetry', ['server/opentelemetry/', 'server/opentelemetry/tracing']),
  group('Reference', [
    'server/reference/legacy-decorators',
    'server/reference/migrating-to-2',
    'server/reference/migrating-from-nestjs',
  ]),
]

const builder: Entry[] = [
  'builder/',
  'builder/quick-start',
  'builder/how-it-works',
  group(
    'Essentials',
    [
      'builder/essentials/endpoints',
      'builder/essentials/inputs',
      'builder/essentials/responses',
      'builder/essentials/errors',
      'builder/essentials/schemas',
      'builder/essentials/http-client',
    ],
    { collapsed: false },
  ),
  group(
    'Guides',
    [
      'builder/guides/file-uploads',
      'builder/guides/downloads-and-streams',
      'builder/guides/navios-server',
      'builder/guides/organizing',
      'builder/guides/mocking',
      'builder/guides/testing',
    ],
    { collapsed: false },
  ),
  group('Realtime', ['builder/realtime/websocket', 'builder/realtime/server-sent-events']),
  group(
    'React Query',
    [
      'builder/react-query/',
      'builder/react-query/queries',
      'builder/react-query/infinite-queries',
      'builder/react-query/mutations',
      'builder/react-query/optimistic-updates',
      'builder/react-query/keys-and-invalidation',
      'builder/react-query/errors',
      'builder/react-query/uploads-and-downloads',
      'builder/react-query/ssr',
      group('Recipes', [
        'builder/react-query/recipes/forms',
        'builder/react-query/recipes/realtime-updates',
      ]),
    ],
    { collapsed: false },
  ),
  group('Reference', [
    'builder/reference/builder',
    'builder/reference/react-query',
    'builder/reference/migrating-to-2',
  ]),
]

const di: Entry[] = [
  'di/',
  'di/quick-start',
  'di/how-it-works',
  group(
    'Essentials',
    [
      'di/essentials/services',
      'di/essentials/tokens',
      'di/essentials/providers',
      'di/essentials/scopes',
      'di/essentials/lifecycle',
      'di/essentials/factories',
    ],
    { collapsed: false },
  ),
  group(
    'Guides',
    ['di/guides/testing', 'di/guides/circular-dependencies', 'di/guides/invalidation'],
    { collapsed: false },
  ),
  group('React', ['di/react/', 'di/react/using-services', 'di/react/scopes-and-invalidation'], {
    collapsed: false,
  }),
  group('Reference', ['di/reference/api', 'di/reference/react-api', 'di/reference/migrating-to-2']),
]

const commander: Entry[] = [
  'commander/getting-started',
  group('Overview', ['commander/overview']),
  group('Guides', [
    'commander/guides/commands',
    'commander/guides/modules',
    'commander/guides/dependency-injection',
    'commander/guides/execution-context',
    'commander/guides/validation',
    'commander/guides/testing',
  ]),
  'commander/api-reference',
  group('Recipes', [
    'commander/recipes/database-commands',
    'commander/recipes/file-operations',
    'commander/recipes/api-clients',
    'commander/recipes/multi-command-workflows',
  ]),
  'commander/best-practices',
]

export const sidebar = {
  '/docs/server/': resolve(server),
  '/docs/builder/': resolve(builder),
  '/docs/di/': resolve(di),
  '/docs/commander/': resolve(commander),
}
