import type { SidebarsConfig } from '@docusaurus/plugin-content-docs'

const sidebars: SidebarsConfig = {
  diSidebar: [
    'intro',
    {
      type: 'category',
      label: 'DI Core',
      collapsed: false,
      items: [
        'di/overview',
        {
          type: 'category',
          label: 'Getting Started',
          collapsed: false,
          items: [
            'di/getting-started/setup',
            'di/getting-started/first-service',
            'di/getting-started/injection-tokens',
            'di/getting-started/bound-factory-tokens',
            'di/getting-started/factories',
            'di/getting-started/service-override',
          ],
        },
        {
          type: 'category',
          label: 'Architecture',
          collapsed: false,
          items: [
            'di/architecture/overview',
            'di/architecture/core-concepts',
          ],
        },
        {
          type: 'category',
          label: 'Guides',
          items: [
            'di/guides/services',
            'di/guides/factories',
            'di/guides/injection-tokens',
            'di/guides/scopes',
            'di/guides/lifecycle',
            'di/guides/request-contexts',
            'di/guides/circular-dependencies',
            'di/guides/testing',
            'di/guides/browser-support',
          ],
        },
        'di/api-reference',
        {
          type: 'category',
          label: 'Recipes',
          collapsed: true,
          items: [
            'di/recipes/configuration-services',
            'di/recipes/database-connections',
            'di/recipes/http-clients',
            'di/recipes/caching-patterns',
            'di/recipes/multi-tenant',
          ],
        },
        'di/best-practices',
        'di/faq',
      ],
    },
    {
      type: 'category',
      label: 'DI React',
      collapsed: false,
      items: [
        'di-react/getting-started',
        {
          type: 'category',
          label: 'Guides',
          items: [
            'di-react/guides/setup',
            'di-react/guides/hooks',
            'di-react/guides/providers',
            'di-react/guides/scopes',
            'di-react/guides/invalidation',
            'di-react/guides/suspense',
            'di-react/guides/error-handling',
          ],
        },
        'di-react/api-reference',
        {
          type: 'category',
          label: 'Recipes',
          collapsed: true,
          items: [
            'di-react/recipes/form-handling',
            'di-react/recipes/data-fetching',
            'di-react/recipes/realtime-updates',
            'di-react/recipes/table-rows',
            'di-react/recipes/modal-dialogs',
            'di-react/recipes/multi-tenant-ui',
          ],
        },
        'di-react/best-practices',
        'di-react/faq',
      ],
    },
  ],
}

export default sidebars
