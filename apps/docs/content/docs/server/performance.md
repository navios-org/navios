---
title: Performance
---

# Performance

Navios is measured against NestJS, against the libraries its adapters are built on, and against a server with no framework on each runtime. The benchmark is its own repository, [navios-benchmark](https://github.com/navios-org/navios-benchmark), with every result of the run, the method, and the commands to repeat it.

The figures on this page are from the run of 2026-11-26: `@navios/server` 2.0.0-alpha.0, `@navios/core` 1.1.0 for the 1.x line, NestJS 12.6.0, Fastify 5.12.8, Hono 4.13.21, Elysia 1.4.32 and Zod 4.6.7, on an Apple M4 Max (16 cores, 48 GiB) with Node.js 24.22.1 and Bun 1.4.5. They describe that machine and those versions.

## What is measured

Every server implements the same API from one set of Zod schemas and one set of services. The load is a closed loop of 64 connections, 5 rounds of 3 s per measurement, each round in a new process and a new random order. Every figure is the median of the rounds.

| Scenario  | Request                           | What it costs a server                                              |
| --------- | --------------------------------- | ------------------------------------------------------------------- |
| `ping`    | `GET /ping`                       | The framework itself                                                |
| `param`   | `GET /users/:id`                  | A path parameter and a service                                      |
| `query`   | `GET /search?…`                   | Four query parameters, coerced and validated                        |
| `post`    | `POST /users`                     | A small JSON body, validated                                        |
| `order`   | `POST /orders`                    | A nested JSON body of 1 KB, validated                               |
| `list`    | `GET /posts`                      | Two services and a page of 20 records                               |
| `large`   | `GET /catalog`                    | 31 KB of JSON, 100 nested records                                   |
| `auth`    | `GET /me`                         | A guard that reads a header and hands a user to the handler         |
| `chain`   | `GET /chain`                      | Three interceptors (or hooks, or middlewares) that each set a header |
| `scoped`  | `GET /scoped`                     | Two request-scoped services                                         |
| `invalid` | `POST /users`, 400                | A body that fails validation                                        |
| `missing` | `GET /users/0`, 404               | A 404                                                               |
| `io`      | `GET /io`                         | A handler that awaits 5 ms, as for a database                       |
| `mix`     | eight of the scenarios above      | A weighted workload: 40 % `param`, 15 % each `query` and `list`, 10 % each `post` and `auth`, 5 % `order`, 3 % `missing`, 2 % `invalid` |

There are two validation modes:

- **full**: requests and responses are validated against their schemas. This is the default of Navios, and what Nest does with `StandardSchemaValidationPipe` and `StandardSchemaSerializerInterceptor`.
- **request**: only requests are validated, and a handler's result is serialised as it is. In Navios that is `validateResponses: 'never'`.

The tables below are in full mode unless they say otherwise.

### Fairness

A benchmark between servers that do different work measures the difference in work. Before anything is measured, a conformance check starts every server in every mode and checks that every scenario answers with the same status and the same JSON, that the same 17 invalid requests are refused with 400, that defaults of the query schema are applied, that a field the response schema does not declare is removed in full mode, and that request-scoped services are built once per request. Each server is compiled with `tsc` and runs with `NODE_ENV=production` and logging off, and frameworks keep their defaults. Where a framework with a container works differently from a library by design, each does what its documentation shows: in `scoped` the libraries build two objects with `new`, and in `missing` they return the 404 instead of throwing it. Against a library, those two scenarios show what a container and exceptions cost, not a difference in the same work.

## Throughput on Node.js

Requests per second. `node:http` is a server with hand-written routing and the same validation: the floor of the runtime. Nest / Node is NestJS on `@nestjs/platform-node`.

|                       | ping  | param | query | post  | list  | large | scoped | mix   |
| --------------------- | ----: | ----: | ----: | ----: | ----: | ----: | -----: | ----: |
| node:http             | 132k  | 118k  | 97.6k | 92.5k | 69.2k | 18.7k | 129k   | 89.9k |
| Fastify + JSON Schema | 124k  | 116k  | 103k  | 89.3k | 72.0k | 16.4k | 121k   | 91.6k |
| Fastify + Zod         | 119k  | 113k  | 96.4k | 82.3k | 69.7k | 18.3k | 118k   | 85.2k |
| Hono                  | 119k  | 111k  | 76.2k | 72.4k | 58.5k | 18.5k | 118k   | 75.9k |
| Navios 2 / Fastify    | 114k  | 108k  | 88.7k | 80.8k | 63.8k | 18.5k | 92.6k  | 81.8k |
| Navios 1 / Fastify    | 81.9k | 78.0k | 68.0k | 62.5k | 52.7k | 17.1k | 33.9k  | 59.1k |
| Nest / Node           | 84.8k | 77.5k | 65.7k | 59.5k | 52.1k | 17.4k | 42.1k  | 60.6k |
| Nest / Fastify        | 81.6k | 74.2k | 63.7k | 57.4k | 48.4k | 16.2k | 41.8k  | 58.4k |
| Express               | 72.0k | 65.8k | 59.5k | 54.4k | 47.6k | 14.6k | 68.6k  | 55.3k |
| Nest / Express        | 54.4k | 50.2k | 44.9k | 42.0k | 38.4k | 13.6k | 32.7k  | 42.5k |

Plain Fastify with the same Zod schemas is faster than Navios on Fastify: by 2 to 9 % on most routes, by 22 % in `scoped` and 18 % in `missing`, where Navios builds services in a container and maps a thrown exception and the plain server does neither. On the 31 KB catalog the two are within the noise, and Navios is 27 % faster on a body that fails validation.

Navios 2 on Fastify serves 35 to 45 % more requests per second than Nest on its Node adapter in most scenarios, 22 % more on the page of records and 120 % more with request-scoped services, which make a Nest controller request-scoped. On the 31 KB catalog, where serialising dominates, the two are within the noise (+6 %). Against Nest on Fastify the gap is 39 to 51 % on most routes, 32 % on the page of records and 14 % on the 31 KB catalog.

## Throughput on Bun

`Bun.serve` is the floor of the runtime. Nest has no adapter for `Bun.serve`; the two Nest rows are the same Nest application run by Bun.

|                | ping | param | query | post | list  | large | scoped | mix   |
| -------------- | ---: | ----: | ----: | ---: | ----: | ----: | -----: | ----: |
| Bun.serve      | 277k | 259k  | 172k  | 172k | 117k  | 28.8k | 275k   | 166k  |
| Hono           | 237k | 217k  | 128k  | 127k | 98.4k | 27.8k | 237k   | 129k  |
| Elysia         | 232k | 211k  | 160k  | 145k | 112k  | 29.5k | 229k   | 144k  |
| Navios 2 / Bun | 229k | 208k  | 136k  | 131k | 103k  | 28.7k | 158k   | 136k  |
| Navios 1 / Bun | 209k | 188k  | 130k  | 141k | 99.6k | 28.4k | 56.1k  | 110k  |
| Nest / Node    | 107k | 98.3k | 88.2k | 81.7k | 71.0k | 26.6k | 59.8k  | 78.6k |
| Nest / Fastify | 102k | 93.9k | 81.8k | 76.1k | 68.1k | 26.3k | 56.4k  | 75.0k |

Elysia is faster than Navios on Bun: by 2 to 9 % on `param`, `post`, `order`, `list`, `large` and `auth`, by 13 to 18 % on `query`, `chain` and `missing`, and by 31 % in `scoped`. On `ping` the two are within the noise, and Navios is 11 % faster on a body that fails validation. Against Hono the result depends on the route: Navios is 4 % behind on `ping` and `param`, 3 to 20 % ahead in eight scenarios (a query, a body, a page of records, a guard, interceptors), and 33 % and 22 % behind in `scoped` and `missing`. These differences are in the full [head-to-head table](https://github.com/navios-org/navios-benchmark/blob/main/RESULTS.md#head-to-head).

Navios 2 on Bun serves 1.5 to 2 times what it serves on Node.js. At a moderate fixed rate the tail is longer on Bun, for `Bun.serve` as for every framework on it: at 40k requests per second of the mixed workload, the 99th percentile is 0.13 ms for Navios on Bun and 0.05 ms on Node.js.

## In one number

Geometric means over every scenario but `io`: requests per second relative to Navios 2 / Fastify, and the share of the floor of its own runtime (`node:http` or `Bun.serve` with the same validation) that each server keeps. The last column is the CPU time of one `GET /users/:id`.

|                       | Runtime | Relative throughput  | Share of its floor | µs of CPU per request, `param` |
| --------------------- | ------- | -------------------: | -----------------: | -----------------------------: |
| Bun.serve             | Bun     | 2.19×                | 100 %              | 4.0                            |
| Elysia                | Bun     | 1.91×                | 88 %               | 4.9                            |
| Navios 2 / Bun        | Bun     | 1.74×                | 80 %               | 4.9                            |
| Hono                  | Bun     | 1.73×                | 79 %               | 4.8                            |
| Navios 1 / Bun        | Bun     | 1.36× (11 scenarios) | 62 %               | 5.5                            |
| node:http             | Node.js | 1.15×                | 100 %              | 8.5                            |
| Fastify + JSON Schema | Node.js | 1.11×                | 97 %               | 8.6                            |
| Fastify + Zod         | Node.js | 1.05×                | 92 %               | 8.9                            |
| Navios 2 / Fastify    | Node.js | 1.00×                | 87 %               | 9.3                            |
| Nest / Node           | Bun     | 0.98×                | 45 %               | 10.5                           |
| Hono                  | Node.js | 0.93×                | 81 %               | 9.0                            |
| Nest / Fastify        | Bun     | 0.93×                | 43 %               | 11.0                           |
| Nest / Node           | Node.js | 0.72×                | 63 %               | 12.9                           |
| Express               | Node.js | 0.69×                | 61 %               | 15.3                           |
| Nest / Fastify        | Node.js | 0.69×                | 60 %               | 13.5                           |
| Navios 1 / Fastify    | Node.js | 0.68× (11 scenarios) | 59 %               | 12.9                           |
| Nest / Express        | Node.js | 0.51×                | 44 %               | 20.1                           |

Two servers ran twice per round under a second name, as if they were different servers. Navios 2 / Fastify differed from itself by 0.2 % in the median and 0.8 % at most, Navios 2 / Bun by 0.6 % and 2.4 %. A difference between two servers has to exceed that.

## 2.0 against 1.x

The difference in requests per second between 2.0 and 1.x on the same adapter. A difference is marked ≈ when the ranges of the two overlap, so that the rounds do not tell them apart.

|            | ping  | param | query | post  | order | list  | large | auth   | scoped | invalid | missing |
| ---------- | ----: | ----: | ----: | ----: | ----: | ----: | ----: | -----: | -----: | ------: | ------: |
| On Fastify | +40 % | +39 % | +30 % | +29 % | +15 % | +21 % | ≈ +8 % | +216 % | +173 % | +30 %   | +30 %   |
| On Bun     | +10 % | +10 % | +5 %  | −7 %  | ≈ −6 % | ≈ +4 % | ≈ +1 % | +260 % | +182 % | +16 %   | +12 %   |

The two large differences are `auth` and `scoped`. There 1.x builds a request-scoped controller for every request, and 2.0 does not: it is 2.7 to 3.6 times as fast. See [Migrating to 2.0](/docs/server/reference/migrating-to-2) for what changed.

### What is slower than 1.x

On Bun, 2.0 handles requests with a JSON body 6 to 7 % more slowly than 1.x: the `post` and `order` columns above. It reads the body as bytes, decodes it and checks it for `__proto__` keys, which 1.x did not do. Reading it with `request.text()` instead would recover about half of that: 0.25 µs of the 0.5 µs per request, measured separately. On Fastify the same two scenarios are 29 % and 15 % faster than 1.x.

## What validating responses costs

Requests per second in request mode against full mode: what a server gains when responses are sent as they are.

|                    | ping  | param | query | post  | order | list  | large |
| ------------------ | ----: | ----: | ----: | ----: | ----: | ----: | ----: |
| Navios 2 / Fastify | +1 %  | +4 %  | +3 %  | +2 %  | +2 %  | +9 %  | +20 % |
| Fastify + Zod      | +2 %  | +2 %  | +3 %  | +5 %  | +3 %  | +7 %  | +19 % |
| Nest / Node        | +25 % | +23 % | +21 % | +19 % | +7 %  | +18 % | +26 % |
| Navios 2 / Bun     | +2 %  | +7 %  | +6 %  | +5 %  | +7 %  | +15 % | +70 % |
| Elysia             | +3 %  | +7 %  | +9 %  | +4 %  | +7 %  | +24 % | +68 % |
| Bun.serve          | +1 %  | +5 %  | +8 %  | +4 %  | +7 %  | +28 % | +76 % |

On Node.js it costs Navios 1 to 4 % on most routes, 9 % on a page of 20 records and 20 % on the 31 KB catalog. On Bun, where everything else is cheaper, the same Zod validation is a larger share: 15 % and 70 % on those two. The servers without a framework pay about the same, so this is the cost of the schema library on a large response, not of Navios. Nest's `StandardSchemaSerializerInterceptor` costs 7 to 26 % on every route, about 20 % on most.

Validation is also what removes fields the schema does not declare from a response. The [`validateResponses`](/docs/server/essentials/application#options) option turns it off for an application.

## Startup and memory

Startup is the time from spawning the process to the first answer of `GET /ping`, in milliseconds, as the median of 20 starts. `modules` runs the compiled files with `node_modules`; `bundle` is one file, built with rolldown for Node.js and `bun build` for Bun. Memory is resident memory in MiB: after start-up and a collection (idle), and the most during 8 s of the mixed workload at 10k requests per second (peak).

|                    | Runtime | Start, modules | Start, bundle | Idle | Peak |
| ------------------ | ------- | -------------: | ------------: | ---: | ---: |
| Bun.serve          | Bun     | 21             | 16            | 42   | 67   |
| Hono               | Bun     | 24             | 17            | 44   | 74   |
| Navios 2 / Bun     | Bun     | 35             | 29            | 50   | 81   |
| Navios 1 / Bun     | Bun     | 36             | 30            | 53   | 98   |
| Elysia             | Bun     | 41             | 27            | 54   | 86   |
| node:http          | Node.js | 75             | 62            | 77   | 95   |
| Fastify + Zod      | Node.js | 101            | 72            | 84   | 111  |
| Navios 1 / Fastify | Node.js | 129            | 94            | 102  | 225  |
| Navios 2 / Fastify | Node.js | 132            | 100           | 99   | 126  |
| Nest / Node        | Node.js | 180            | 122           | 110  | 136  |
| Nest / Fastify     | Node.js | 191            | 133           | 112  | 148  |

Navios 2 starts in 35 ms on Bun and 132 ms on Node.js, 100 ms when bundled. That is 31 ms more than plain Fastify with Zod on Node.js, and 14 ms more than `Bun.serve` on Bun (differences of the figures above). Under the same load, 1.x on Fastify grew to 225 MiB and 2.0 to 126 MiB.

## What has not been measured

The run has no server on `@navios/adapter-srvx`, so there are no figures for Cloudflare Workers, AWS Lambda or Deno, and none for srvx on Node.js or Bun. On Bun, `@navios/adapter-bun` registers routes with the router of `Bun.serve`, which the [srvx adapter](/docs/server/adapters/srvx) cannot do; on Node.js it has not been measured to be faster than Fastify. Use the figures above for the Fastify and Bun adapters only.

## Running it yourself

The [benchmark repository](https://github.com/navios-org/navios-benchmark) has the full tables in [RESULTS.md](https://github.com/navios-org/navios-benchmark/blob/main/RESULTS.md): every scenario, latency at fixed rates, 1 to 256 connections, and a comparison of load tools. Its [README](https://github.com/navios-org/navios-benchmark#running-it) describes the load driver, how noise is handled, and how to run the benchmark or add a server to it.
