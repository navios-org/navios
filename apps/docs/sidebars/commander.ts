import type { SidebarsConfig } from '@docusaurus/plugin-content-docs'

const sidebars: SidebarsConfig = {
  commanderSidebar: [
    'getting-started',
    {
      type: 'category',
      label: 'Overview',
      items: ['overview'],
    },
    {
      type: 'category',
      label: 'Guides',
      items: [
        'guides/commands',
        'guides/modules',
        'guides/dependency-injection',
        'guides/execution-context',
        'guides/validation',
        'guides/testing',
      ],
    },
    'api-reference',
    {
      type: 'category',
      label: 'Recipes',
      collapsed: true,
      items: [
        'recipes/database-commands',
        'recipes/file-operations',
        'recipes/api-clients',
        'recipes/multi-command-workflows',
      ],
    },
    'best-practices',
  ],
}

export default sidebars

