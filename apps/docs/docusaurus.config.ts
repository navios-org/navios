import { themes as prismThemes } from 'prism-react-renderer'
import type { Config } from '@docusaurus/types'
import type * as Preset from '@docusaurus/preset-classic'

const config: Config = {
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
  onBrokenMarkdownLinks: 'warn',

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
  ],

  themeConfig: {
    image: 'img/navios-social-card.png',
    colorMode: {
      defaultMode: 'dark',
      disableSwitch: false,
      respectPrefersColorScheme: true,
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
          ],
        },
        {
          title: 'Packages',
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
