import type { ReactNode } from 'react'
import { useState } from 'react'
import clsx from 'clsx'
import Link from '@docusaurus/Link'
import useDocusaurusContext from '@docusaurus/useDocusaurusContext'
import Layout from '@theme/Layout'
import Heading from '@theme/Heading'
import CodeBlock from '@theme/CodeBlock'

import styles from './index.module.css'

const installCommand =
  'npm install @navios/core @navios/adapter-fastify @navios/builder zod'

function HomepageHeader() {
  const { siteConfig } = useDocusaurusContext()
  return (
    <header className={clsx('hero', styles.heroBanner)}>
      <div className={styles.heroContent}>
        <Heading as="h1" className="hero__title">
          {siteConfig.title}
        </Heading>
        <p className="hero__subtitle">{siteConfig.tagline}</p>

        {/* Install command */}
        <div className={styles.installCommand}>
          <code>{installCommand}</code>
          <button
            className={styles.copyButton}
            onClick={() => navigator.clipboard.writeText(installCommand)}
            title="Copy to clipboard"
          >
            Copy
          </button>
        </div>

        <div className={styles.buttons}>
          <Link className="button button--primary button--lg" to="/docs/server">
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

      {/* Hero diagram */}
      <div className={styles.heroDiagram}>
        <div className={styles.diagramBox}>
          <span className={styles.diagramLabel}>Client</span>
          <code>getUser(userId)</code>
        </div>
        <div className={styles.diagramArrow}>
          <span>Type-Safe</span>
          <div className={styles.arrowLine} />
        </div>
        <div className={styles.diagramBox}>
          <span className={styles.diagramLabel}>Shared Schema</span>
          <code>@navios/builder</code>
        </div>
        <div className={styles.diagramArrow}>
          <span>Validated</span>
          <div className={styles.arrowLine} />
        </div>
        <div className={styles.diagramBox}>
          <span className={styles.diagramLabel}>Server</span>
          <code>@Endpoint(getUser)</code>
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
    link: '/docs/server',
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
    link: '/docs/server/adapters/fastify',
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
        <Heading as="h2" className={styles.sectionTitle}>
          Why Navios?
        </Heading>
        <p className={styles.sectionSubtitle}>
          A modern approach to building type-safe APIs with TypeScript
        </p>
        <div className={clsx('row', styles.featuresRow)}>
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  )
}

const codeExamples = {
  schema: `// shared/api.ts
import { builder } from '@navios/builder'
import { z } from 'zod'

export const API = builder()

export const getUser = API.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  responseSchema: z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
  }),
})`,
  server: `// server/user.controller.ts
import { Controller, Endpoint, EndpointParams } from '@navios/core'
import { getUser } from '../shared/api.js'

@Controller()
export class UserController {
  @Endpoint(getUser)
  async getUser(params: EndpointParams<typeof getUser>) {
    const { userId } = params.urlParams
    // Full type inference for params and return type
    return {
      id: userId,
      name: 'John Doe',
      email: 'john@example.com',
    }
  }
}`,
  client: `// client/app.ts
import { create } from '@navios/http'  // or axios
import { API, getUser } from '../shared/api.js'

API.provideClient(create({ baseUrl: 'http://localhost:3000' }))

// Full autocomplete and type checking
const user = await getUser({
  urlParams: { userId: '123' },
})

console.log(user.name)  // TypeScript knows this is string
console.log(user.email) // TypeScript knows this is string`,
}

type TabKey = keyof typeof codeExamples

function CodeExample(): ReactNode {
  const [activeTab, setActiveTab] = useState<TabKey>('schema')

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'schema', label: 'Define Schema' },
    { key: 'server', label: 'Use on Server' },
    { key: 'client', label: 'Call from Client' },
  ]

  return (
    <section className={styles.codeSection}>
      <div className="container">
        <Heading as="h2" className={styles.sectionTitle}>
          Define Once, Use Everywhere
        </Heading>
        <p className={styles.sectionSubtitle}>
          Create type-safe API definitions that work seamlessly on both client
          and server
        </p>
        <div className={styles.codeContainer}>
          <div className={styles.codeTabs}>
            {tabs.map((tab) => (
              <button
                key={tab.key}
                className={clsx(
                  styles.codeTab,
                  activeTab === tab.key && styles.codeTabActive,
                )}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <CodeBlock language="typescript">{codeExamples[activeTab]}</CodeBlock>
        </div>
      </div>
    </section>
  )
}

function ComparisonSection(): ReactNode {
  return (
    <section className={styles.comparisonSection}>
      <div className="container">
        <Heading as="h2" className={styles.sectionTitle}>
          How Navios Compares
        </Heading>
        <p className={styles.sectionSubtitle}>
          See how Navios stacks up against other popular frameworks
        </p>
        <div className={styles.comparisonTable}>
          <table>
            <thead>
              <tr>
                <th>Feature</th>
                <th>Navios</th>
                <th>NestJS</th>
                <th>Express</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>TypeScript Native</td>
                <td className={styles.checkCell}>✅</td>
                <td className={styles.checkCell}>✅</td>
                <td className={styles.crossCell}>❌</td>
              </tr>
              <tr>
                <td>Shared Client/Server Types</td>
                <td className={styles.checkCell}>✅</td>
                <td className={styles.crossCell}>❌</td>
                <td className={styles.crossCell}>❌</td>
              </tr>
              <tr>
                <td>ES Decorators (TC39)</td>
                <td className={styles.checkCell}>✅</td>
                <td className={styles.crossCell}>Legacy</td>
                <td className={styles.crossCell}>❌</td>
              </tr>
              <tr>
                <td>Bun Support</td>
                <td className={styles.checkCell}>✅</td>
                <td className={styles.warnCell}>Limited</td>
                <td className={styles.checkCell}>✅</td>
              </tr>
              <tr>
                <td>Built-in Validation</td>
                <td className={styles.checkCell}>Zod</td>
                <td className={styles.checkCell}>class-validator</td>
                <td className={styles.crossCell}>❌</td>
              </tr>
              <tr>
                <td>Bundle Size</td>
                <td className={styles.checkCell}>Small</td>
                <td className={styles.warnCell}>Large</td>
                <td className={styles.checkCell}>Minimal</td>
              </tr>
              <tr>
                <td>DI Flexibility</td>
                <td className={styles.checkCell}>Hierarchical</td>
                <td className={styles.warnCell}>Module-bound</td>
                <td className={styles.crossCell}>❌</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

function EcosystemSection(): ReactNode {
  const ecosystem = {
    adapters: [
      {
        name: 'Fastify',
        description: 'High-performance Node.js server',
        link: '/docs/server/adapters/fastify',
      },
      {
        name: 'Bun',
        description: 'Native Bun HTTP server',
        link: '/docs/server/adapters/bun',
      },
    ],
    recipes: [
      {
        name: 'JWT Auth',
        description: 'JSON Web Token authentication',
        link: '/docs/server/recipes/authentication',
      },
      {
        name: 'Scheduled Tasks',
        description: 'Cron-based job scheduling',
        link: '/docs/server/recipes/schedule',
      },
      {
        name: 'Prisma ORM',
        description: 'Type-safe database access',
        link: '/docs/server/recipes/prisma',
      },
    ],
  }

  return (
    <section className={styles.ecosystemSection}>
      <div className="container">
        <Heading as="h2" className={styles.sectionTitle}>
          Ecosystem
        </Heading>
        <p className={styles.sectionSubtitle}>
          Adapters, plugins, and integrations to build your application
        </p>
        <div className="row">
          <div className="col col--6">
            <div className={styles.ecosystemCategory}>
              <Heading as="h3">Adapters</Heading>
              <div className={styles.ecosystemList}>
                {ecosystem.adapters.map((item) => (
                  <Link
                    key={item.name}
                    to={item.link}
                    className={styles.ecosystemItem}
                  >
                    <span className={styles.ecosystemName}>{item.name}</span>
                    <span className={styles.ecosystemDesc}>
                      {item.description}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
          <div className="col col--6">
            <div className={styles.ecosystemCategory}>
              <Heading as="h3">Recipes</Heading>
              <div className={styles.ecosystemList}>
                {ecosystem.recipes.map((item) => (
                  <Link
                    key={item.name}
                    to={item.link}
                    className={styles.ecosystemItem}
                  >
                    <span className={styles.ecosystemName}>{item.name}</span>
                    <span className={styles.ecosystemDesc}>
                      {item.description}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function PackagesSection(): ReactNode {
  const packages = [
    {
      name: '@navios/core',
      description:
        'HTTP server framework with decorators, modules, and controllers',
      link: '/docs/server',
      npm: 'https://www.npmjs.com/package/@navios/core',
    },
    {
      name: '@navios/builder',
      description:
        'Type-safe API declarations shared between client and server',
      link: '/docs/builder',
      npm: 'https://www.npmjs.com/package/@navios/builder',
    },
    {
      name: '@navios/di',
      description:
        'Lightweight dependency injection with hierarchical containers',
      link: '/docs/di',
      npm: 'https://www.npmjs.com/package/@navios/di',
    },
  ]

  return (
    <section className={styles.packagesSection}>
      <div className="container">
        <Heading as="h2" className={styles.sectionTitle}>
          Packages
        </Heading>
        <div className="row">
          {packages.map((pkg) => (
            <div key={pkg.name} className="col col--4">
              <div className={styles.packageCard}>
                <div className={styles.packageHeader}>
                  <span className={styles.packageBadge}>{pkg.name}</span>
                  <a
                    href={pkg.npm}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.npmBadge}
                  >
                    <img
                      src={`https://img.shields.io/npm/v/${pkg.name}?style=flat-square&color=22d3ee`}
                      alt={`${pkg.name} version`}
                    />
                  </a>
                </div>
                <p>{pkg.description}</p>
                <Link to={pkg.link}>Learn more →</Link>
              </div>
            </div>
          ))}
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
        <ComparisonSection />
        <EcosystemSection />
        <PackagesSection />
      </main>
    </Layout>
  )
}
