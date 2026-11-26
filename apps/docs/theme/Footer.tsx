import { Link } from '@rspress/core/theme-original'

import styles from './footer.module.css'

const npm = (name: string) => ({ label: name, href: `https://www.npmjs.com/package/${name}` })

const columns = [
  {
    title: 'Documentation',
    links: [
      { label: 'Server', href: '/docs/server/' },
      { label: 'Builder', href: '/docs/builder/' },
      { label: 'DI', href: '/docs/di/' },
      { label: 'Commander', href: '/docs/commander/getting-started' },
    ],
  },
  {
    title: 'Core Packages',
    links: ['@navios/server', '@navios/core', '@navios/builder', '@navios/di', '@navios/http'].map(npm),
  },
  {
    title: 'Adapters & Tools',
    links: [
      '@navios/adapter-fastify',
      '@navios/adapter-bun',
      '@navios/adapter-srvx',
      '@navios/adapter-xml',
      '@navios/jwt',
      '@navios/schedule',
      '@navios/commander',
      '@navios/react-query',
      '@navios/openapi',
      '@navios/otel',
    ].map(npm),
  },
  {
    title: 'More',
    links: [{ label: 'GitHub', href: 'https://github.com/navios-org/navios' }],
  },
]

export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.columns}>
        {columns.map((column) => (
          <div key={column.title}>
            <h2 className={styles.title}>{column.title}</h2>
            <ul className={styles.list}>
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className={styles.link}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className={styles.copyright}>Copyright © {new Date().getFullYear()} Navios Framework.</p>
    </footer>
  )
}
