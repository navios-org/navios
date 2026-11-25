import { CodeBlockRuntime, Link } from '@rspress/core/theme'
import clsx from 'clsx'
import { useState } from 'react'

import type { ReactNode } from 'react'

import styles from '../theme/home.module.css'

const githubUrl = 'https://github.com/Arilas/navios'
const installCommand = 'npm install @navios/core @navios/adapter-fastify @navios/builder zod'

const heroCode = `@Controller()
export class UserController {
  private users = inject(UserService)

  @Endpoint(getUser)
  async getUser(params: EndpointParams<typeof getUser>) {
    // urlParams and the return type come from the definition
    return this.users.find(params.urlParams.userId)
  }
}`

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className={styles.sectionHeading}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {subtitle && <p className={styles.sectionSubtitle}>{subtitle}</p>}
    </div>
  )
}

function CodeWindow({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div className={styles.window}>
      <div className={styles.windowBar}>
        <span className={styles.windowDots} aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <div className={styles.windowTitle}>{title}</div>
      </div>
      <div className={styles.windowBody}>{children}</div>
    </div>
  )
}

function InstallCommand() {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    await navigator.clipboard.writeText(installCommand)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className={styles.install}>
      <span className={styles.installPrompt} aria-hidden="true">
        $
      </span>
      <code>{installCommand}</code>
      <button type="button" className={styles.installCopy} onClick={copy}>
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  )
}

function Hero() {
  return (
    <header className={styles.hero}>
      <div className={styles.heroText}>
        <p className={styles.eyebrow}>TypeScript · ES decorators · Standard Schema</p>
        <h1 className={styles.heroTitle}>
          Type-safe APIs, <span className={styles.gradientText}>end to end</span>
        </h1>
        <p className={styles.heroSubtitle}>
          Navios is a decorator-based framework for building modern APIs. Define an endpoint once
          and use it on the server and the client.
        </p>
        <div className={styles.buttons}>
          <Link className={clsx(styles.button, styles.buttonPrimary)} href="/docs/server/">
            Get started
          </Link>
          <Link className={clsx(styles.button, styles.buttonSecondary)} href={githubUrl}>
            View on GitHub
          </Link>
        </div>
        <InstallCommand />
      </div>
      <div className={styles.heroCode}>
        <CodeWindow title="user.controller.ts">
          <CodeBlockRuntime lang="typescript" code={heroCode} />
        </CodeWindow>
      </div>
    </header>
  )
}

type Feature = {
  title: string
  description: string
  link: string
  icon: ReactNode
  size: 'wide' | 'half' | 'narrow'
  extra?: ReactNode
}

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      className={styles.tileIcon}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

const flow = (
  <div className={styles.flow}>
    <div className={styles.flowBox}>
      <span>Client</span>
      <code>getUser(&#123; urlParams &#125;)</code>
    </div>
    <span className={styles.flowArrow} aria-hidden="true" />
    <div className={clsx(styles.flowBox, styles.flowBoxAccent)}>
      <span>Shared definition</span>
      <code>@navios/builder</code>
    </div>
    <span className={styles.flowArrow} aria-hidden="true" />
    <div className={styles.flowBox}>
      <span>Server</span>
      <code>@Endpoint(getUser)</code>
    </div>
  </div>
)

const features: Feature[] = [
  {
    title: 'Shared API definitions',
    description:
      'Define your API once with @navios/builder and use it on both client and server. No more type mismatches or manual syncing.',
    link: '/docs/builder/',
    size: 'wide',
    extra: flow,
    icon: (
      <Icon>
        <path d="M8 3 4 7l4 4" />
        <path d="M4 7h16" />
        <path d="m16 21 4-4-4-4" />
        <path d="M20 17H4" />
      </Icon>
    ),
  },
  {
    title: 'Type-safe by design',
    description:
      'Built with TypeScript from the ground up. Full type inference across your entire API, from endpoint definitions to response handling.',
    link: '/docs/builder/',
    size: 'narrow',
    icon: (
      <Icon>
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </Icon>
    ),
  },
  {
    title: 'Decorator-based architecture',
    description:
      'Define modules, controllers, and endpoints with intuitive decorators. Clean, readable code that scales with your application.',
    link: '/docs/server/',
    size: 'half',
    icon: (
      <Icon>
        <path d="m12 2 9 5-9 5-9-5 9-5Z" />
        <path d="m3 12 9 5 9-5" />
        <path d="m3 17 9 5 9-5" />
      </Icon>
    ),
  },
  {
    title: 'Powerful DI container',
    description:
      'Lightweight dependency injection with hierarchical containers, multiple scopes, and async resolution for clean architecture.',
    link: '/docs/di/',
    size: 'half',
    icon: (
      <Icon>
        <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" />
        <path d="m3 8 9 5 9-5" />
        <path d="M12 13v8" />
      </Icon>
    ),
  },
  {
    title: 'Schema validation',
    description:
      'Validate requests and responses with Zod, Valibot, ArkType or any Standard Schema library. Types are inferred from your schemas.',
    link: '/docs/builder/',
    size: 'narrow',
    icon: (
      <Icon>
        <circle cx="12" cy="12" r="10" />
        <path d="m9 12 2 2 4-4" />
      </Icon>
    ),
  },
  {
    title: 'Adapter-agnostic',
    description:
      'Run on Fastify or Bun with the same codebase. Switch runtimes without changing your application code.',
    link: '/docs/server/adapters/fastify',
    size: 'wide',
    extra: (
      <div className={styles.chips}>
        <span className={styles.chip}>Fastify</span>
        <span className={styles.chip}>Bun</span>
      </div>
    ),
    icon: (
      <Icon>
        <path d="M12 22v-5" />
        <path d="M9 8V2" />
        <path d="M15 8V2" />
        <path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z" />
      </Icon>
    ),
  },
]

function Features() {
  return (
    <section className={styles.section}>
      <SectionHeading
        title="Why Navios?"
        subtitle="A modern approach to building type-safe APIs with TypeScript"
      />
      <div className={styles.bento}>
        {features.map((feature) => (
          <Link
            key={feature.title}
            href={feature.link}
            className={clsx(styles.tile, styles[feature.size])}
          >
            <span className={styles.tileIconWrap}>{feature.icon}</span>
            <h3 className={styles.tileTitle}>{feature.title}</h3>
            <p className={styles.tileText}>{feature.description}</p>
            {feature.extra}
          </Link>
        ))}
      </div>
    </section>
  )
}

const walkthrough = [
  {
    key: 'define',
    label: 'Define',
    file: 'shared/api.ts',
    code: `import { builder } from '@navios/builder'
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
  },
  {
    key: 'serve',
    label: 'Serve',
    file: 'server/user.controller.ts',
    code: `import { Controller, Endpoint } from '@navios/server'
import type { HandlerParams } from '@navios/server'
import { getUser } from '../shared/api.js'

@Controller()
export class UserController {
  @Endpoint(getUser)
  async getUser({ urlParams }: HandlerParams<typeof getUser>) {
    const { userId } = urlParams
    // Params are typed, and the return value is checked against the declaration
    return {
      id: userId,
      name: 'John Doe',
      email: 'john@example.com',
    }
  }
}`,
  },
  {
    key: 'call',
    label: 'Call',
    file: 'client/app.ts',
    code: `import { create } from '@navios/http'  // or axios
import { API, getUser } from '../shared/api.js'

API.provideClient(create({ baseUrl: 'http://localhost:3000' }))

// Full autocomplete and type checking
const user = await getUser({
  urlParams: { userId: '123' },
})

console.log(user.name)  // TypeScript knows this is string
console.log(user.email) // TypeScript knows this is string`,
  },
] as const

function Walkthrough() {
  const [active, setActive] = useState(0)
  const step = walkthrough[active]

  return (
    <section className={styles.section}>
      <SectionHeading
        title="One definition, three places"
        subtitle="Create type-safe API definitions that work on both client and server"
      />
      <div className={styles.walkthrough}>
        <CodeWindow
          title={
            <div className={styles.tabs} role="tablist">
              {walkthrough.map((item, index) => (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  aria-selected={index === active}
                  className={clsx(styles.tab, index === active && styles.tabActive)}
                  onClick={() => setActive(index)}
                >
                  <span className={styles.tabNumber}>{index + 1}</span>
                  {item.label}
                </button>
              ))}
              <span className={styles.tabFile}>{step.file}</span>
            </div>
          }
        >
          <CodeBlockRuntime lang="typescript" code={step.code} />
        </CodeWindow>
      </div>
    </section>
  )
}

type Cell = { text: string; tone: 'yes' | 'no' | 'partial' }

const yes = (text = 'Yes'): Cell => ({ text, tone: 'yes' })
const no = (text = 'No'): Cell => ({ text, tone: 'no' })
const partial = (text: string): Cell => ({ text, tone: 'partial' })

const comparison: { feature: string; cells: [Cell, Cell, Cell] }[] = [
  { feature: 'TypeScript native', cells: [yes(), yes(), no()] },
  { feature: 'Shared client/server types', cells: [yes(), no(), no()] },
  { feature: 'ES decorators (TC39)', cells: [yes(), no('Legacy'), no()] },
  { feature: 'Bun support', cells: [yes(), partial('Limited'), yes()] },
  { feature: 'Built-in validation', cells: [yes('Standard Schema'), yes('class-validator'), no()] },
  { feature: 'Bundle size', cells: [yes('Small'), partial('Large'), yes('Minimal')] },
  { feature: 'DI flexibility', cells: [yes('Hierarchical'), partial('Module-bound'), no()] },
]

function Comparison() {
  return (
    <section className={styles.section}>
      <SectionHeading
        title="How Navios compares"
        subtitle="See how Navios stacks up against other popular frameworks"
      />
      <div className={styles.tableCard}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col">Feature</th>
              <th scope="col" className={styles.tableOurs}>
                Navios
              </th>
              <th scope="col">NestJS</th>
              <th scope="col">Express</th>
            </tr>
          </thead>
          <tbody>
            {comparison.map((row) => (
              <tr key={row.feature}>
                <th scope="row">{row.feature}</th>
                {row.cells.map((cell, index) => (
                  <td
                    key={index}
                    className={clsx(styles[cell.tone], index === 0 && styles.tableOurs)}
                  >
                    {cell.text}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

const packages = [
  {
    name: '@navios/server',
    description: 'HTTP server framework with decorators, modules, and controllers',
    link: '/docs/server/',
  },
  {
    name: '@navios/builder',
    description: 'Type-safe API declarations shared between client and server',
    link: '/docs/builder/',
  },
  {
    name: '@navios/di',
    description: 'Lightweight dependency injection with hierarchical containers',
    link: '/docs/di/',
  },
]

const pieces = [
  {
    title: 'Adapters',
    items: [
      {
        name: 'Fastify',
        description: 'High-performance Node.js server',
        link: '/docs/server/adapters/fastify',
      },
      { name: 'Bun', description: 'Native Bun HTTP server', link: '/docs/server/adapters/bun' },
    ],
  },
  {
    title: 'Recipes',
    items: [
      {
        name: 'JWT auth',
        description: 'JSON Web Token authentication',
        link: '/docs/server/guides/authentication',
      },
      {
        name: 'Scheduled tasks',
        description: 'Cron-based job scheduling',
        link: '/docs/server/guides/scheduled-jobs',
      },
      {
        name: 'Prisma ORM',
        description: 'Type-safe database access',
        link: '/docs/server/guides/prisma',
      },
    ],
  },
]

function Pieces() {
  return (
    <section className={styles.section}>
      <SectionHeading
        title="Pick your pieces"
        subtitle="Core packages, adapters, and recipes to build your application"
      />
      <div className={styles.packages}>
        {packages.map((pkg) => (
          <div key={pkg.name} className={styles.package}>
            <div className={styles.packageHead}>
              <code className={styles.packageName}>{pkg.name}</code>
              <a
                href={`https://www.npmjs.com/package/${pkg.name}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <img
                  src={`https://img.shields.io/npm/v/${pkg.name}?style=flat-square&color=ea580c`}
                  alt={`${pkg.name} version`}
                  height={20}
                />
              </a>
            </div>
            <p className={styles.tileText}>{pkg.description}</p>
            <Link href={pkg.link} className={styles.packageLink}>
              Read the docs <span aria-hidden="true">→</span>
            </Link>
          </div>
        ))}
      </div>
      <div className={styles.pieces}>
        {pieces.map((group) => (
          <div key={group.title} className={styles.pieceGroup}>
            <h3 className={styles.pieceTitle}>{group.title}</h3>
            <div className={styles.pieceList}>
              {group.items.map((item) => (
                <Link key={item.name} href={item.link} className={styles.piece}>
                  <span className={styles.pieceName}>{item.name}</span>
                  <span className={styles.pieceDesc}>{item.description}</span>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function ClosingCta() {
  return (
    <section className={styles.section}>
      <div className={styles.cta}>
        <h2 className={styles.ctaTitle}>
          Start with <span className={styles.gradientText}>one endpoint</span>
        </h2>
        <p className={styles.sectionSubtitle}>
          Set up a server, declare an endpoint, and call it with full types in a few minutes.
        </p>
        <div className={clsx(styles.buttons, styles.buttonsCentered)}>
          <Link className={clsx(styles.button, styles.buttonPrimary)} href="/docs/server/">
            Get started
          </Link>
          <Link className={clsx(styles.button, styles.buttonSecondary)} href="/docs/builder/">
            Explore Builder
          </Link>
        </div>
      </div>
    </section>
  )
}

export const frontmatter = { pageType: 'custom' }

export default function Home(): ReactNode {
  return (
    <div className={styles.home}>
      <Hero />
      <main>
        <Features />
        <Walkthrough />
        <Comparison />
        <Pieces />
        <ClosingCta />
      </main>
    </div>
  )
}
