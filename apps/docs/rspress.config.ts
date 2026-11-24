import { defineConfig } from '@rspress/core'
import mermaid from 'rspress-plugin-mermaid'

import { sidebar } from './sidebars.mts'

const siteUrl = 'https://navios.tech'

export default defineConfig({
  root: 'content',
  outDir: 'build',
  title: 'Navios Framework',
  description: 'Type-safe, decorator-based framework for building modern APIs',
  icon: '/img/favicon.ico',
  logo: '/img/logo.svg',
  logoText: 'Navios',
  siteOrigin: siteUrl,
  sitemap: { siteUrl },
  plugins: [mermaid()],
  markdown: {
    // A broken link or anchor fails the build.
    link: { checkDeadLinks: true, checkAnchors: true },
    // Shiki has no PromQL grammar.
    shiki: { langAlias: { promql: 'text' } },
  },
  themeConfig: {
    darkMode: 'dark',
    nav: [
      { text: 'Server', link: '/docs/server/', activeMatch: '^/docs/server/' },
      { text: 'Builder', link: '/docs/builder/', activeMatch: '^/docs/builder/' },
      { text: 'DI', link: '/docs/di/', activeMatch: '^/docs/di/' },
      { text: 'Commander', link: '/docs/commander/getting-started', activeMatch: '^/docs/commander/' },
    ],
    sidebar,
    socialLinks: [{ icon: 'github', mode: 'link', content: 'https://github.com/Arilas/navios' }],
    editLink: { docRepoBaseUrl: 'https://github.com/Arilas/navios/tree/main/apps/docs/content' },
  },
})
