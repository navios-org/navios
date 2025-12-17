import type { ReactNode } from 'react'
import clsx from 'clsx'
import Link from '@docusaurus/Link'
import useDocusaurusContext from '@docusaurus/useDocusaurusContext'
import Layout from '@theme/Layout'
import Heading from '@theme/Heading'

import styles from './index.module.css'

function HomepageHeader() {
  const { siteConfig } = useDocusaurusContext()
  return (
    <header className={clsx('hero', styles.heroBanner)}>
      <div className="container">
        <Heading as="h1" className="hero__title">
          {siteConfig.title}
        </Heading>
        <p className="hero__subtitle">{siteConfig.tagline}</p>
        <div className={styles.buttons}>
          <Link className="button button--primary button--lg" to="/docs/core">
            Get Started
          </Link>
          <Link
            className="button button--secondary button--lg"
            to="https://github.com/Arilas/navios"
          >
            View on GitHub
          </Link>
        </div>
      </div>
    </header>
  )
}

type FeatureItem = {
  title: string
  icon: string
  description: ReactNode
  link: string
}

const FeatureList: FeatureItem[] = [
  {
    title: 'Type-Safe by Design',
    icon: '🔒',
    description: (
      <>
        Built with TypeScript from the ground up. Full type inference across
        your entire API, from endpoint definitions to response handling.
      </>
    ),
    link: '/docs/builder',
  },
  {
    title: 'Decorator-Based Architecture',
    icon: '🏗️',
    description: (
      <>
        Define modules, controllers, and endpoints with intuitive decorators.
        Clean, readable code that scales with your application.
      </>
    ),
    link: '/docs/core',
  },
  {
    title: 'Shared API Definitions',
    icon: '🔄',
    description: (
      <>
        Define your API once with @navios/builder and use it on both client and
        server. No more type mismatches or manual syncing.
      </>
    ),
    link: '/docs/builder',
  },
  {
    title: 'Powerful DI Container',
    icon: '💉',
    description: (
      <>
        Lightweight dependency injection with hierarchical containers, multiple
        scopes, and async resolution for clean architecture.
      </>
    ),
    link: '/docs/di',
  },
  {
    title: 'Adapter-Agnostic',
    icon: '🔌',
    description: (
      <>
        Run on Fastify or Bun with the same codebase. Switch runtimes without
        changing your application code.
      </>
    ),
    link: '/docs/core/adapters/fastify',
  },
  {
    title: 'Zod Validation',
    icon: '✅',
    description: (
      <>
        First-class Zod integration for request and response validation.
        Automatic type inference from your schemas.
      </>
    ),
    link: '/docs/builder',
  },
]

function Feature({ title, icon, description, link }: FeatureItem) {
  return (
    <div className={clsx('col col--4')}>
      <Link to={link} className={styles.featureLink}>
        <div className={styles.featureCard}>
          <div className={styles.featureIcon}>{icon}</div>
          <Heading as="h3" className={styles.featureTitle}>
            {title}
          </Heading>
          <p className={styles.featureDescription}>{description}</p>
        </div>
      </Link>
    </div>
  )
}

function HomepageFeatures(): ReactNode {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  )
}

function CodeExample(): ReactNode {
  return (
    <section className={styles.codeSection}>
      <div className="container">
        <div className="row">
          <div className="col col--6">
            <Heading as="h2">Define Once, Use Everywhere</Heading>
            <p>
              Create type-safe API definitions with @navios/builder that work
              seamlessly on both client and server.
            </p>
            <ul className={styles.benefitsList}>
              <li>Shared types between frontend and backend</li>
              <li>Automatic request/response validation</li>
              <li>Full IDE autocomplete support</li>
              <li>Zero runtime overhead</li>
            </ul>
          </div>
          <div className="col col--6">
            <pre className={styles.codeBlock}>
              <code>{`// shared/api.ts
import { builder } from '@navios/builder'
import { z } from 'zod'

const API = builder()

export const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: z.object({
    id: z.string(),
    name: z.string(),
  }),
})`}</code>
            </pre>
          </div>
        </div>
      </div>
    </section>
  )
}

function PackagesSection(): ReactNode {
  return (
    <section className={styles.packagesSection}>
      <div className="container">
        <Heading as="h2" className={styles.sectionTitle}>
          Packages
        </Heading>
        <div className="row">
          <div className="col col--4">
            <div className={styles.packageCard}>
              <span className={styles.packageBadge}>@navios/core</span>
              <p>
                HTTP server framework with decorators, modules, and controllers
              </p>
              <Link to="/docs/core">Learn more →</Link>
            </div>
          </div>
          <div className="col col--4">
            <div className={styles.packageCard}>
              <span className={styles.packageBadge}>@navios/builder</span>
              <p>Type-safe API declarations shared between client and server</p>
              <Link to="/docs/builder">Learn more →</Link>
            </div>
          </div>
          <div className="col col--4">
            <div className={styles.packageCard}>
              <span className={styles.packageBadge}>@navios/di</span>
              <p>
                Lightweight dependency injection with hierarchical containers
              </p>
              <Link to="/docs/di">Learn more →</Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

export default function Home(): ReactNode {
  const { siteConfig } = useDocusaurusContext()
  return (
    <Layout
      title="Home"
      description="Type-safe, decorator-based framework for building modern APIs"
    >
      <HomepageHeader />
      <main>
        <HomepageFeatures />
        <CodeExample />
        <PackagesSection />
      </main>
    </Layout>
  )
}
