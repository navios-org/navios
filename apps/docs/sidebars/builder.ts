import type { SidebarsConfig } from '@docusaurus/plugin-content-docs'

const sidebars: SidebarsConfig = {
  builderSidebar: [
    'intro',
    {
      type: 'category',
      label: 'Builder',
      collapsed: false,
      items: [
        'builder/getting-started',
        'builder/overview',
        {
          type: 'category',
          label: 'Guides',
          items: [
            'builder/guides/defining-endpoints',
            'builder/guides/url-parameters',
            'builder/guides/query-parameters',
            'builder/guides/schemas',
            'builder/guides/error-handling',
            'builder/guides/http-client',
          ],
        },
        {
          type: 'category',
          label: 'Advanced',
          collapsed: true,
          items: [
            'builder/advanced/streams',
            'builder/advanced/multipart',
            'builder/advanced/websocket',
            'builder/advanced/eventsource',
            'builder/advanced/discriminated-unions',
            'builder/advanced/custom-handlers',
          ],
        },
        'builder/api-reference',
        'builder/best-practices',
      ],
    },
    {
      type: 'category',
      label: 'React Query',
      collapsed: false,
      items: [
        'react-query/getting-started',
        'react-query/overview',
        {
          type: 'category',
          label: 'Guides',
          items: [
            'react-query/guides/queries',
            'react-query/guides/infinite-queries',
            'react-query/guides/mutations',
            'react-query/guides/scoped-mutations',
            'react-query/guides/multipart-mutations',
            'react-query/guides/query-keys',
            'react-query/guides/invalidation',
            'react-query/guides/suspense',
            'react-query/guides/mutation-context',
            'react-query/guides/optimistic-updates',
          ],
        },
        {
          type: 'category',
          label: 'Advanced',
          collapsed: true,
          items: [
            'react-query/advanced/streams',
            'react-query/advanced/ssr-prefetch',
            'react-query/advanced/error-schemas',
            'react-query/advanced/query-client-config',
          ],
        },
        'react-query/api-reference',
        'react-query/best-practices',
        {
          type: 'category',
          label: 'Recipes',
          collapsed: true,
          items: [
            'react-query/recipes/complete-example',
            'react-query/recipes/form-handling',
            'react-query/recipes/realtime-updates',
          ],
        },
      ],
    },
  ],
}

export default sidebars
