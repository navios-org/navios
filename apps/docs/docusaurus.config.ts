import type * as Preset from '@docusaurus/preset-classic'
import type { Config } from '@docusaurus/types'

import { themes as prismThemes } from 'prism-react-renderer'

const config: Config = {
  markdown: {
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },
  themes: ['@docusaurus/theme-mermaid'],

  title: 'Navios Framework',
  tagline: 'Type-safe, decorator-based framework for building modern APIs',
  favicon: 'img/favicon.ico',

  future: {
    v4: true,
  },

  url: 'https://navios.tech',
  baseUrl: '/',

  organizationName: 'Arilas',
  projectName: 'navios',

  onBrokenLinks: 'warn',

  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          id: 'server',
          path: 'docs/server',
          routeBasePath: 'docs/server',
          sidebarPath: './sidebars/server.ts',
          editUrl: 'https://github.com/Arilas/navios/tree/main/apps/docs/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  plugins: [
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'builder',
        path: 'docs/builder',
        routeBasePath: 'docs/builder',
        sidebarPath: './sidebars/builder.ts',
        editUrl: 'https://github.com/Arilas/navios/tree/main/apps/docs/',
      },
    ],
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'di',
        path: 'docs/di',
        routeBasePath: 'docs/di',
        sidebarPath: './sidebars/di.ts',
        editUrl: 'https://github.com/Arilas/navios/tree/main/apps/docs/',
      },
    ],
    // [
    //   '@docusaurus/plugin-content-docs',
    //   {
    //     id: 'packages',
    //     path: 'docs/packages',
    //     routeBasePath: 'docs/packages',
    //     sidebarPath: './sidebars/packages.ts',
    //     editUrl: 'https://github.com/Arilas/navios/tree/main/apps/docs/',
    //   },
    // ],
    [
      '@docusaurus/plugin-content-docs',
      {
        id: 'commander',
        path: 'docs/commander',
        routeBasePath: 'docs/commander',
        sidebarPath: './sidebars/commander.ts',
        editUrl: 'https://github.com/Arilas/navios/tree/main/apps/docs/',
      },
    ],
  ],

  themeConfig: {
    image: 'img/navios-social-card.png',
    colorMode: {
      defaultMode: 'dark',
      disableSwitch: false,
      respectPrefersColorScheme: true,
    },
    mermaid: {
      theme: {
        light: 'default',
        dark: 'dark',
      },
    },
    navbar: {
      title: 'Navios',
      logo: {
        alt: 'Navios Logo',
        src: 'img/logo.svg',
      },
      items: [
        {
          type: 'docSidebar',
          sidebarId: 'serverSidebar',
          position: 'left',
          label: 'Server',
          docsPluginId: 'server',
        },
        {
          type: 'docSidebar',
          sidebarId: 'builderSidebar',
          position: 'left',
          label: 'Builder',
          docsPluginId: 'builder',
        },
        {
          type: 'docSidebar',
          sidebarId: 'diSidebar',
          position: 'left',
          label: 'DI',
          docsPluginId: 'di',
        },
        // {
        //   type: 'docSidebar',
        //   sidebarId: 'packagesSidebar',
        //   position: 'left',
        //   label: 'Packages',
        //   docsPluginId: 'packages',
        // },
        {
          type: 'docSidebar',
          sidebarId: 'commanderSidebar',
          position: 'left',
          label: 'Commander',
          docsPluginId: 'commander',
        },
        {
          href: 'https://github.com/Arilas/navios',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Documentation',
          items: [
            {
              label: 'Server',
              to: '/docs/server',
            },
            {
              label: 'Builder',
              to: '/docs/builder',
            },
            {
              label: 'DI',
              to: '/docs/di',
            },
            // {
            //   label: 'Packages',
            //   to: '/docs/packages',
            // },
            {
              label: 'Commander',
              to: '/docs/commander/getting-started',
            },
          ],
        },
        {
          title: 'Core Packages',
          items: [
            {
              label: '@navios/core',
              href: 'https://www.npmjs.com/package/@navios/core',
            },
            {
              label: '@navios/builder',
              href: 'https://www.npmjs.com/package/@navios/builder',
            },
            {
              label: '@navios/di',
              href: 'https://www.npmjs.com/package/@navios/di',
            },
            {
              label: '@navios/http',
              href: 'https://www.npmjs.com/package/@navios/http',
            },
          ],
        },
        {
          title: 'Adapters & Tools',
          items: [
            {
              label: '@navios/adapter-fastify',
              href: 'https://www.npmjs.com/package/@navios/adapter-fastify',
            },
            {
              label: '@navios/adapter-bun',
              href: 'https://www.npmjs.com/package/@navios/adapter-bun',
            },
            {
              label: '@navios/adapter-xml',
              href: 'https://www.npmjs.com/package/@navios/adapter-xml',
            },
            {
              label: '@navios/jwt',
              href: 'https://www.npmjs.com/package/@navios/jwt',
            },
            {
              label: '@navios/schedule',
              href: 'https://www.npmjs.com/package/@navios/schedule',
            },
            {
              label: '@navios/commander',
              href: 'https://www.npmjs.com/package/@navios/commander',
            },
            {
              label: '@navios/react-query',
              href: 'https://www.npmjs.com/package/@navios/react-query',
            },
            {
              label: '@navios/openapi',
              href: 'https://www.npmjs.com/package/@navios/openapi',
            },
            {
              label: '@navios/openapi-fastify',
              href: 'https://www.npmjs.com/package/@navios/openapi-fastify',
            },
            {
              label: '@navios/openapi-bun',
              href: 'https://www.npmjs.com/package/@navios/openapi-bun',
            },
            {
              label: '@navios/otel',
              href: 'https://www.npmjs.com/package/@navios/otel',
            },
            {
              label: '@navios/otel-fastify',
              href: 'https://www.npmjs.com/package/@navios/otel-fastify',
            },
            {
              label: '@navios/otel-bun',
              href: 'https://www.npmjs.com/package/@navios/otel-bun',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/Arilas/navios',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Navios Framework. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
      additionalLanguages: ['bash', 'json', 'typescript'],
    },
  } satisfies Preset.ThemeConfig,
}

export default config
