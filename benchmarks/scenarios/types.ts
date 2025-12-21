export interface BenchmarkConfig {
  name: string
  description: string
  duration: number // seconds
  connections: number
  pipelining?: number
  warmup?: number // seconds
  endpoints: EndpointConfig[]
}

export interface EndpointConfig {
  path: string
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: Record<string, unknown>
  headers?: Record<string, string>
}

export interface BenchmarkResult {
  framework: string
  adapter: string
  scenario: string
  endpoint: string
  results: {
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
  memory?: {
    heapUsed: number
    heapTotal: number
    external: number
    rss: number
  }
  environment: {
    node: string
    os: string
    cpu: string
    ram: string
  }
  timestamp: string
}

export interface AppConfig {
  name: string
  adapter: string
  port: number
  startCommand: string
  cwd: string
  runtime: 'node' | 'bun'
}
