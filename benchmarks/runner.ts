#!/usr/bin/env tsx
/**
 * Benchmark Runner
 *
 * Orchestrates benchmark execution across all framework/adapter combinations.
 * Usage:
 *   tsx runner.ts                        # Run navios benchmarks only
 *   tsx runner.ts --all                  # Run full suite (including NestJS)
 *   tsx runner.ts --scenario=light       # Run specific scenario
 *   tsx runner.ts --app=navios-fastify   # Run specific app only
 *   tsx runner.ts --tool=bombardier      # Use bombardier instead of autocannon
 *   tsx runner.ts --tool=autocannon      # Use autocannon (default)
 */
import type { ChildProcess } from 'node:child_process'

import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import { join } from 'node:path'

import autocannon from 'autocannon'
import chalk from 'chalk'
import Table from 'cli-table3'
import ora from 'ora'

import type {
  AppConfig,
  BenchmarkConfig,
  BenchmarkResult,
} from './scenarios/index.js'

import { ALL_SCENARIOS, COLD_START_ITERATIONS } from './scenarios/index.js'

// ============================================
// Types
// ============================================

type BenchmarkTool = 'autocannon' | 'bombardier'

interface BenchmarkToolResult {
  rps: {
    mean: number
    max: number
    p50: number
    p75: number
    p90: number
    p99: number
  }
  latency: {
    mean: number
    max: number
    p50: number
    p75: number
    p90: number
    p99: number
  }
  throughput: {
    average: number
    total: number
  }
  requests: number
  errors: number
}

// ============================================
// Configuration
// ============================================

const APPS: AppConfig[] = [
  {
    name: 'navios',
    adapter: 'fastify',
    port: 3001,
    startCommand: 'yarn start',
    cwd: './apps/navios-fastify',
    runtime: 'node',
  },
  {
    name: 'navios',
    adapter: 'bun',
    port: 3002,
    startCommand: 'yarn start',
    cwd: './apps/navios-bun',
    runtime: 'bun',
  },
  {
    name: 'native',
    adapter: 'bun',
    port: 3005,
    startCommand: 'bun run src/main.mts',
    cwd: './apps/native-bun',
    runtime: 'bun',
  },
  {
    name: 'nestjs',
    adapter: 'express',
    port: 3003,
    startCommand: 'yarn start',
    cwd: './apps/nestjs-express',
    runtime: 'node',
  },
  {
    name: 'nestjs',
    adapter: 'fastify',
    port: 3004,
    startCommand: 'yarn start',
    cwd: './apps/nestjs-fastify',
    runtime: 'node',
  },
]

const RESULTS_DIR = './results'

// ============================================
// Utilities
// ============================================

function parseArgs(): {
  scenario?: string
  app?: string
  all: boolean
  tool: BenchmarkTool
} {
  const args = process.argv.slice(2)
  const result: {
    scenario?: string
    app?: string
    all: boolean
    tool: BenchmarkTool
  } = {
    all: false,
    tool: 'bombardier',
  }

  for (const arg of args) {
    if (arg.startsWith('--scenario=')) {
      result.scenario = arg.split('=')[1]
    } else if (arg.startsWith('--app=')) {
      result.app = arg.split('=')[1]
    } else if (arg === '--all') {
      result.all = true
    } else if (arg.startsWith('--tool=')) {
      const tool = arg.split('=')[1] as BenchmarkTool
      if (tool !== 'autocannon' && tool !== 'bombardier') {
        console.error(chalk.red(`Unknown tool: ${tool}`))
        console.log(chalk.gray('Available tools: autocannon, bombardier'))
        process.exit(1)
      }
      result.tool = tool
    }
  }

  return result
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function waitForServer(
  port: number,
  maxAttempts = 50,
  interval = 200,
): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`http://localhost:${port}/health`)
      if (response.ok) {
        return true
      }
    } catch {
      // Server not ready yet
    }
    await sleep(interval)
  }
  return false
}

function startApp(app: AppConfig): ChildProcess {
  const [cmd, ...args] = app.startCommand.split(' ')
  const child = spawn(cmd!, args, {
    cwd: join(process.cwd(), app.cwd),
    env: { ...process.env, PORT: String(app.port), NODE_ENV: 'production' },
    stdio: 'pipe',
    shell: true,
  })

  return child
}

function stopApp(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (!child.killed) {
      child.kill('SIGTERM')
      setTimeout(() => {
        if (!child.killed) {
          child.kill('SIGKILL')
        }
        resolve()
      }, 2000)
    } else {
      resolve()
    }
  })
}

function getEnvironmentInfo() {
  const cpus = os.cpus()
  return {
    node: process.version,
    os: `${os.platform()} ${os.arch()}`,
    cpu: cpus[0]?.model || 'Unknown',
    ram: `${Math.round(os.totalmem() / 1024 / 1024 / 1024)} GB`,
  }
}

// ============================================
// Cold Start Benchmark
// ============================================

async function measureColdStart(app: AppConfig): Promise<number[]> {
  const times: number[] = []

  for (let i = 0; i < COLD_START_ITERATIONS; i++) {
    const startTime = Date.now()
    const child = startApp(app)

    const ready = await waitForServer(app.port, 100, 100)
    const duration = Date.now() - startTime

    await stopApp(child)

    if (ready) {
      times.push(duration)
    }

    // Cool down between iterations
    await sleep(500)
  }

  return times
}

// ============================================
// Throughput Benchmark
// ============================================

async function runAutocannon(
  port: number,
  config: BenchmarkConfig,
  endpoint: {
    path: string
    method: string
    body?: unknown
    headers?: Record<string, string>
  },
): Promise<BenchmarkToolResult> {
  const url = `http://localhost:${port}${endpoint.path}`

  const options: autocannon.Options = {
    url,
    method: endpoint.method as autocannon.Options['method'],
    duration: config.duration,
    connections: config.connections,
    pipelining: config.pipelining || 1,
    headers: endpoint.headers,
    body: endpoint.body ? JSON.stringify(endpoint.body) : undefined,
  }

  return new Promise((resolve, reject) => {
    const instance = autocannon(options, (err, result) => {
      if (err) {
        reject(err)
      } else {
        // autocannon provides latency percentiles, not RPS percentiles
        // We use requests.average as mean RPS
        resolve({
          rps: {
            mean: result.requests.average ?? 0,
            max: result.requests.max ?? 0,
            p50: result.requests.average ?? 0, // autocannon doesn't have RPS percentiles
            p75: result.requests.average ?? 0,
            p90: result.requests.average ?? 0,
            p99: result.requests.average ?? 0,
          },
          latency: {
            mean: result.latency.average ?? 0,
            max: result.latency.max ?? 0,
            p50: result.latency.p50 ?? 0,
            p75: result.latency.p75 ?? 0,
            p90: result.latency.p90 ?? 0,
            p99: result.latency.p99 ?? 0,
          },
          throughput: {
            average: result.throughput.average ?? 0,
            total: result.throughput.total ?? 0,
          },
          requests: result.requests.total ?? 0,
          errors: result.errors,
        })
      }
    })

    // Suppress output
    instance.on('response', () => {})
  })
}

interface BombardierResult {
  spec: {
    numberOfConnections: number
    testType: string
    testDurationSeconds: number
    method: string
    url: string
  }
  result: {
    req1xx: number
    req2xx: number
    req3xx: number
    req4xx: number
    req5xx: number
    others: number
    latency: {
      mean: number
      stddev: number
      max: number
      percentiles: Record<string, number>
    }
    rps: {
      mean: number
      stddev: number
      max: number
      percentiles: Record<string, number>
    }
  }
}

async function runBombardier(
  port: number,
  config: BenchmarkConfig,
  endpoint: {
    path: string
    method: string
    body?: unknown
    headers?: Record<string, string>
  },
): Promise<BenchmarkToolResult> {
  const url = `http://localhost:${port}${endpoint.path}`

  const args = [
    '-c',
    String(config.connections),
    '-d',
    `${config.duration}s`,
    '-m',
    endpoint.method,
    '-l', // Enable latency percentiles
    '--print',
    'r',
    '--format',
    'json',
  ]

  // Add headers
  if (endpoint.headers) {
    for (const [key, value] of Object.entries(endpoint.headers)) {
      args.push('-H', `${key}: ${value}`)
    }
  }

  // Add body for POST/PUT/PATCH
  if (endpoint.body) {
    args.push('-b', JSON.stringify(endpoint.body))
    args.push('-H', 'Content-Type: application/json')
  }

  args.push(url)

  return new Promise((resolve, reject) => {
    const bombardier = spawn('bombardier', args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''

    bombardier.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    bombardier.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    bombardier.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`bombardier exited with code ${code}: ${stderr}`))
        return
      }

      try {
        const result: BombardierResult = JSON.parse(stdout)
        const rpsPercentiles = result.result.rps.percentiles
        const latencyPercentiles = result.result.latency.percentiles

        // Bombardier latency is in microseconds, convert to milliseconds
        const toMs = (us: number) => us / 1_000

        const totalRequests =
          result.result.req1xx +
          result.result.req2xx +
          result.result.req3xx +
          result.result.req4xx +
          result.result.req5xx +
          result.result.others

        resolve({
          rps: {
            mean: result.result.rps.mean,
            max: result.result.rps.max,
            p50: rpsPercentiles['50'] ?? result.result.rps.mean,
            p75: rpsPercentiles['75'] ?? result.result.rps.mean,
            p90: rpsPercentiles['90'] ?? result.result.rps.mean,
            p99: rpsPercentiles['99'] ?? result.result.rps.mean,
          },
          latency: {
            mean: toMs(result.result.latency.mean),
            max: toMs(result.result.latency.max),
            p50: toMs(latencyPercentiles['50'] ?? result.result.latency.mean),
            p75: toMs(latencyPercentiles['75'] ?? result.result.latency.mean),
            p90: toMs(latencyPercentiles['90'] ?? result.result.latency.mean),
            p99: toMs(latencyPercentiles['99'] ?? result.result.latency.mean),
          },
          throughput: {
            average: 0, // bombardier doesn't report throughput in bytes
            total: 0,
          },
          requests: totalRequests,
          errors:
            result.result.req4xx + result.result.req5xx + result.result.others,
        })
      } catch (e) {
        reject(new Error(`Failed to parse bombardier output: ${e}`))
      }
    })

    bombardier.on('error', (err) => {
      reject(
        new Error(
          `Failed to spawn bombardier: ${err.message}. Is bombardier installed?`,
        ),
      )
    })
  })
}

async function runBenchmarkTool(
  tool: BenchmarkTool,
  port: number,
  config: BenchmarkConfig,
  endpoint: {
    path: string
    method: string
    body?: unknown
    headers?: Record<string, string>
  },
): Promise<BenchmarkToolResult> {
  if (tool === 'bombardier') {
    return runBombardier(port, config, endpoint)
  }
  return runAutocannon(port, config, endpoint)
}

// ============================================
// Memory Benchmark
// ============================================

async function measureMemory(port: number): Promise<BenchmarkResult['memory']> {
  try {
    // This would require an endpoint in the app to report memory
    // For now, return undefined - implement if needed
    return undefined
  } catch {
    return undefined
  }
}

// ============================================
// Main Benchmark Logic
// ============================================

async function runScenario(
  app: AppConfig,
  scenario: BenchmarkConfig,
  spinner: ReturnType<typeof ora>,
  tool: BenchmarkTool,
): Promise<BenchmarkResult[]> {
  const results: BenchmarkResult[] = []
  const env = getEnvironmentInfo()

  // Handle cold start separately
  if (scenario.name === 'cold-start') {
    spinner.text = `${app.name}/${app.adapter}: Measuring cold start...`

    const times = await measureColdStart(app)
    const median =
      times.sort((a, b) => a - b)[Math.floor(times.length / 2)] || 0

    results.push({
      framework: app.name,
      adapter: app.adapter,
      scenario: scenario.name,
      endpoint: '/health',
      results: {
        rps: {
          mean: 0,
          max: 0,
          p50: 0,
          p75: 0,
          p90: 0,
          p99: 0,
        },
        latency: {
          mean: median,
          max: Math.max(...times),
          p50: median,
          p75: median,
          p90: median,
          p99: median,
        },
        throughput: { average: 0, total: 0 },
        requests: times.length,
        errors: COLD_START_ITERATIONS - times.length,
      },
      environment: env,
      timestamp: new Date().toISOString(),
    })

    return results
  }

  // Start the app
  spinner.text = `${app.name}/${app.adapter}: Starting server...`
  const child = startApp(app)

  const ready = await waitForServer(app.port)
  if (!ready) {
    await stopApp(child)
    throw new Error(`Failed to start ${app.name}/${app.adapter}`)
  }

  // Warmup
  if (scenario.warmup) {
    spinner.text = `${app.name}/${app.adapter}: Warming up...`
    await runBenchmarkTool(
      tool,
      app.port,
      { ...scenario, duration: scenario.warmup },
      scenario.endpoints[0]!,
    )
  }

  // Run benchmarks for each endpoint
  for (const endpoint of scenario.endpoints) {
    spinner.text = `${app.name}/${app.adapter}: Testing ${endpoint.method} ${endpoint.path}...`

    const benchmarkResult = await runBenchmarkTool(
      tool,
      app.port,
      scenario,
      endpoint,
    )
    const memory = await measureMemory(app.port)

    results.push({
      framework: app.name,
      adapter: app.adapter,
      scenario: scenario.name,
      endpoint: `${endpoint.method} ${endpoint.path}`,
      results: benchmarkResult,
      memory,
      environment: env,
      timestamp: new Date().toISOString(),
    })
  }

  // Stop the app
  await stopApp(child)

  return results
}

// ============================================
// Output and Reporting
// ============================================

function printResults(results: BenchmarkResult[]): void {
  // Group by scenario
  const byScenario = results.reduce(
    (acc, r) => {
      if (!acc[r.scenario]) acc[r.scenario] = []
      acc[r.scenario].push(r)
      return acc
    },
    {} as Record<string, BenchmarkResult[]>,
  )

  for (const [scenario, scenarioResults] of Object.entries(byScenario)) {
    console.log(chalk.bold.cyan(`\n${scenario.toUpperCase()}`))

    // Group by endpoint
    const byEndpoint = scenarioResults.reduce(
      (acc, r) => {
        if (!acc[r.endpoint]) acc[r.endpoint] = []
        acc[r.endpoint].push(r)
        return acc
      },
      {} as Record<string, BenchmarkResult[]>,
    )

    for (const [endpoint, endpointResults] of Object.entries(byEndpoint)) {
      console.log(chalk.yellow(`\n  ${endpoint}`))

      const table = new Table({
        head: [
          'Framework',
          'RPS mean',
          'RPS p99',
          'Lat p50',
          'Lat p99',
          'Errors',
        ],
        style: { head: ['cyan'] },
      })

      // Sort by RPS mean (descending)
      endpointResults.sort((a, b) => b.results.rps.mean - a.results.rps.mean)

      for (const r of endpointResults) {
        table.push([
          `${r.framework}/${r.adapter}`,
          r.results.rps.mean.toLocaleString(undefined, {
            maximumFractionDigits: 0,
          }),
          r.results.rps.p99.toLocaleString(undefined, {
            maximumFractionDigits: 0,
          }),
          `${r.results.latency.p50.toFixed(2)}ms`,
          `${r.results.latency.p99.toFixed(2)}ms`,
          r.results.errors,
        ])
      }

      console.log(table.toString())
    }
  }
}

async function saveResults(results: BenchmarkResult[]): Promise<void> {
  await mkdir(RESULTS_DIR, { recursive: true })

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filename = join(RESULTS_DIR, `benchmark-${timestamp}.json`)

  await writeFile(filename, JSON.stringify(results, null, 2))
  console.log(chalk.green(`\nResults saved to ${filename}`))
}

// ============================================
// Main
// ============================================

async function main(): Promise<void> {
  const args = parseArgs()

  console.log(chalk.bold.blue('\n🚀 Navios Benchmark Runner\n'))
  console.log(chalk.gray('Environment:'))
  const env = getEnvironmentInfo()
  console.log(chalk.gray(`  Node: ${env.node}`))
  console.log(chalk.gray(`  OS: ${env.os}`))
  console.log(chalk.gray(`  CPU: ${env.cpu}`))
  console.log(chalk.gray(`  RAM: ${env.ram}\n`))

  // Filter apps
  let apps = APPS
  if (args.app) {
    apps = APPS.filter((a) => `${a.name}-${a.adapter}` === args.app)
    if (apps.length === 0) {
      console.error(chalk.red(`Unknown app: ${args.app}`))
      console.log(chalk.gray('Available apps:'))
      APPS.forEach((a) => console.log(chalk.gray(`  - ${a.name}-${a.adapter}`)))
      process.exit(1)
    }
  } else if (!args.all) {
    // By default, only run navios and native apps (not nestjs)
    apps = APPS.filter((a) => a.name === 'navios')
    console.log(
      chalk.gray(
        'Running navios + native benchmarks. Use --all to include NestJS.\n',
      ),
    )
  }

  // Filter scenarios
  let scenarios = Object.entries(ALL_SCENARIOS)
  if (args.scenario) {
    const match = ALL_SCENARIOS[args.scenario]
    if (!match) {
      console.error(chalk.red(`Unknown scenario: ${args.scenario}`))
      console.log(chalk.gray('Available scenarios:'))
      Object.keys(ALL_SCENARIOS).forEach((s) =>
        console.log(chalk.gray(`  - ${s}`)),
      )
      process.exit(1)
    }
    scenarios = [[args.scenario, match]]
  }

  const allResults: BenchmarkResult[] = []
  const spinner = ora()

  for (const [scenarioName, scenario] of scenarios) {
    console.log(
      chalk.bold.magenta(
        `\n📊 Running ${scenarioName}: ${scenario.description}`,
      ),
    )

    for (const app of apps) {
      spinner.start(`${app.name}/${app.adapter}: Initializing...`)

      try {
        const results = await runScenario(app, scenario, spinner, args.tool)
        allResults.push(...results)
        spinner.succeed(`${app.name}/${app.adapter}: Complete`)
      } catch (error) {
        spinner.fail(
          `${app.name}/${app.adapter}: ${error instanceof Error ? error.message : 'Failed'}`,
        )
      }
    }
  }

  // Print and save results
  printResults(allResults)
  await saveResults(allResults)

  console.log(chalk.bold.green('\n✅ Benchmark complete!\n'))
}

main().catch((error) => {
  console.error(chalk.red('Fatal error:'), error)
  process.exit(1)
})
