# Dependency Sweep: Bring Every Package to Current Latest

Date: 2026-11-23
Author: Oleksandr Hanzha (with Claude)
Status: Design — awaiting approval

## Intent and Why

Dependencies across the workspace have drifted behind their current latest versions. Several (TypeScript, Vitest, Vite, OpenTelemetry SDK, amqplib) are a major version or more behind. At the same time, the manual Bun decorator transpilation plugin (`bun-plugin.mts` + `bunfig.toml`, duplicated across seven places in the repo) can go away now that Bun supports stage-3 decorators natively.

The ambition for this sweep is **Option A: all in** — every package goes to current latest, including TypeScript 5.9 → 7 and amqplib 0.10 → 2. We take whatever breaks.

## Goals

- Every workspace dependency (runtime, dev, peer) on its current latest release at sweep time.
- Bun-decorator workaround removed from the repo, along with the `chalk` and `esbuild` devDeps that only existed to serve it.
- Build, typecheck, lint, and test (`yarn build && yarn turbo run check && yarn lint && yarn test:ci`) all green on the resulting `main`.
- Upgrade split into eight PRs so each landing point is bisectable and reviewers see one ecosystem at a time.

## Non-Goals

- Node engine floor changes. We stay on `engines.node >=20.0.0` where declared; the implicit floor rises if a dep requires it, but we do not hunt for that proactively.
- Code-style refactors, API-surface changes to `@navios/*` packages, or anything beyond what a dep upgrade compels.
- Updating `clipanion` past its `4.0.0-rc.4` (it is already at current latest; only moves to a stable release when upstream publishes one).
- `kafkajs` beyond 2.2.4 (already latest).
- Adding or removing packages beyond those that only existed for the Bun workaround.

## Anti-Goals (what would make this a failure)

- A single mega-PR that we cannot bisect when something breaks later.
- Carrying forward a `.yarn/patches/` file against a package version that no longer exists.
- Leaving behind `bunPlugin.cache` artifacts, dangling `chalk` / `esbuild` imports, or orphan `bunfig.toml` files.
- Skipping the `@microsoft/api-extractor` patch re-evaluation — the pinned resolution at 7.52.11 silently diverges from any version we write into `devDependencies`.

## Constraints

- Yarn 4 (`packageManager: yarn@4.12.0`) and Turbo (`yarn turbo run <task> --filter=<pkg>`) per CLAUDE.md.
- `.mts` extension for TypeScript source; `.spec.mts` for unit tests; `.spec-d.mts` for type tests.
- No semicolons, single quotes, oxlint config — lint must still pass under the upgraded `oxlint` / `oxfmt`.
- Each `@navios/*` package ships both ESM and CJS builds via `tsdown`; type tests + runtime tests must pass under the new TypeScript and Vitest.
- `@navios/queues` declares `amqplib` as an **optional peer dep**; the amqplib 2.x migration lives entirely inside that package.
- `@navios/di-react` peers on React `^18 || ^19`; we keep that range even after bumping the workspace's own React to 19.3.
- The `@microsoft/api-extractor` patch in `.yarn/patches/` logs a diagnostic instead of throwing when `AstSymbolTable` cannot resolve a symbol. We must re-check whether it is still needed against 7.60.1, and either regenerate the patch against the new version or drop it.
- **Verification between PRs** is local only: `yarn install && yarn build && yarn turbo run check && yarn lint && yarn test:ci` must pass before the next PR starts. No PR-triggered CI workflow exists today; adding one is out of scope for this sweep.
- **Dependabot must be paused** for the duration of the sweep. Its daily, no-grouping schedule would keep re-opening PRs against the same `package.json` entries this sweep is touching.
- **Minimum Bun version is pinned** as part of PR 1. Published consumers of `@navios/adapter-bun`, `@navios/adapter-xml`, and `@navios/otel-bun` get a clear floor, and local `bun test` runs do not silently succeed on an older Bun that lacks stage-3 decorator support.

## Approaches Considered

Three realistic ways to carry out the sweep were on the table.

### 1. One big-bang PR

Bump everything in a single commit, land it, deal with whatever breaks.

Tradeoff: fastest to type, fastest to merge, but when something regresses two months from now, `git bisect` lands on a commit that touched 40+ dependencies. Rejected.

### 2. Dependabot-style, one PR per package

Every dep in its own PR. CI runs on each. Reviewers can be surgical.

Tradeoff: 30+ PRs, massive review overhead, and coordinated upgrades (OTel SDK, Vitest + coverage + ui, Vite + vite-plugin-node, Fastify ecosystem) get awkwardly split, because the pieces only work together. Rejected.

### 3. Grouped-by-domain, eight PRs — **chosen**

Group deps by the ecosystem that binds them together. Each PR is one coherent change to review and to roll back.

Tradeoff: more PRs than approach 1, less granular than approach 2, but each one is a reviewable unit. This is the recommendation and the plan below.

## Plan — Eight PRs in Order

Each PR runs `yarn install && yarn build && yarn turbo run check && yarn lint && yarn test:ci` locally before being opened; CI must be green before the next PR starts. The order matters: later PRs often depend on earlier ones (e.g. Vitest 5 wants the TS-free parts of the toolchain updated first, and TS 7 goes last because it most often breaks other things).

### PR 1 — Drop the Bun decorator workaround, pin Bun, pause Dependabot

Standalone, no version churn, zero runtime risk. Three concerns bundled because they are all one-time operational prep.

**Pause Dependabot (first commit of this PR):**
- Edit `.github/dependabot.yml` to either disable the `npm` update block or change its `schedule.interval` from `"daily"` to `"monthly"`.
- Note in the PR description that it will be restored in PR 8.

**Pin minimum Bun version (second commit):**
- Add `.bun-version` at repo root (and the three Bun-using examples if they run outside the workspace Bun) naming the Bun release whose `bun test` ships stage-3 decorators natively. The builder picks the exact version by checking the current Bun changelog at sweep time.
- Add `"engines": { "bun": ">=<that version>" }` to `packages/adapter-bun/package.json`, `packages/adapter-xml/package.json`, and `packages/otel-bun/package.json`. Do not add `engines.bun` to packages that don't publish or that don't actually require Bun at install time.

**Remove workaround (third commit):**

Files to delete:
- `bun-plugin.mts`, `bunfig.toml`, `bunPlugin.cache` at repo root
- `packages/adapter-bun/bun-plugin.mts`, `packages/adapter-bun/bunfig.toml`, `packages/adapter-bun/bunPlugin.cache`
- `packages/adapter-xml/bun-plugin.mts`, `packages/adapter-xml/bunfig.toml`, `packages/adapter-xml/bunPlugin.cache`
- `packages/otel-bun/bun-plugin.mts`, `packages/otel-bun/bunfig.toml`, `packages/otel-bun/bunPlugin.cache`
- `examples/e2e-bun-stage3/bun-plugin.mts`, `examples/e2e-bun-stage3/bunfig.toml`, `examples/e2e-bun-stage3/bunPlugin.cache`
- `examples/openapi/bun-plugin.mts`, `examples/openapi/bunfig.toml`, `examples/openapi/bunPlugin.cache`
- `examples/simple-test/bun-plugin.mts`, `examples/simple-test/bunfig.toml`, `examples/simple-test/bunPlugin.cache`, `examples/simple-test/bunPlugin.reload.ts`

Devdeps to remove:
- `chalk` and `esbuild` from `examples/e2e-bun-stage3/package.json` (the only `package.json` that declares them).

Build-time decorator transformation via `unplugin-swc` inside `tsdown.config.mts` is unrelated and stays.

Verification: `cd packages/adapter-bun && bun test` must still pass without the preload. Same for `packages/otel-bun` and any examples that the repo actually runs locally. Running on the pinned Bun version counts as part of this verification.

### PR 2 — Low-risk minor/patch bumps

These are drive-by bumps with no expected breaking changes. All in one PR.

| Package | From → To | Where |
|---|---|---|
| `zod` | 4.3.5 → 4.6.7 | ten packages (devDep); `peerDependencies: ^3.25.0 \|\| ^4.0.0` left alone |
| `yaml` | 2.8.2 → 2.9.1 | `openapi`, `openapi-bun`, `openapi-fastify` |
| `cron` | 4.4.0 → 4.4.2 | `schedule` |
| `@opentelemetry/api` | 1.9.0 → 1.10.0 | `otel`, `otel-bun`, `otel-fastify` + peer |
| `@opentelemetry/sdk-trace-node` | 2.4.0 → 2.12.0 | `otel` |
| `@opentelemetry/semantic-conventions` | 1.39.0 → 1.45.0 | `otel` |
| `@aws-sdk/client-sns` / `client-sqs` | 3.971 → 3.1175 | `queues` (optional) |
| `amqp-connection-manager` | 5.0.0 → 5.0.1 | `queues` (optional) |
| `@tanstack/react-query` | 5.90.20 → 5.108.4 | `react-query` |
| `react` / `react-dom` | 19.2.3 → 19.3.1 | `di-react`, `react-query`, `apps/docs`; peer range unchanged |
| `@types/react` | 19.2.8 → 19.3.0 | `di-react` |
| `@docusaurus/*` | 3.9.2 → 3.10.2 | `apps/docs` |
| `turbo` | 2.7.6 → 2.11.13 | root devDep |
| `oxlint` | 1.41.0 → 1.94.0 | root devDep |
| `oxfmt` | 0.24.0 → 0.79.0 | root devDep — large version jump; run `yarn lint` after and commit any reformatting as part of this PR |
| `tsdown` | 0.19.0 → 0.23.7 | root devDep |
| `tslib` | 2.8.1 → 2.9.1 | root devDep |
| `@types/node` | 25.0.9 → 26.6.6 | root + `cli` |
| `@types/bun` | 1.3.6 / 1.2.12 → 1.4.5 | six places: `packages/adapter-bun`, `packages/adapter-xml`, `packages/otel-bun`, `examples/e2e-bun-legacy`, `examples/e2e-bun-stage3`, `examples/otel-bun` (the last is further behind at `^1.2.12`) |
| `@types/jsonwebtoken` | already latest | — |
| `tsx` | 4.21.0 → 4.23.15 | several packages |
| `@microsoft/api-extractor` | 7.55.2 → 7.60.1 | root devDep — **must re-evaluate the patch** (see below) |
| `@swc/core` | 1.15.10 → 1.16.22 | root devDep |
| `package-manager-detector` | 1.6.0 → 1.9.0 | `cli` |
| `@scalar/core` | 0.3.34 → 0.5.55 | `openapi-bun`, `openapi-fastify` — pre-1.0 so check `CHANGELOG.md` before merging |

**api-extractor patch re-evaluation**: after bumping to 7.60.1, run `yarn turbo run build` for every package that uses `@microsoft/api-extractor` (via `tsdown`'s dts emit). If the patch is no longer needed, delete the patch file and the `resolutions` entry. If it is still needed, regenerate against 7.60.1 with `yarn patch @microsoft/api-extractor@npm:7.60.1` and update the `resolutions` key. **Do not carry the old patch forward with a bumped version target.**

### PR 3 — Testing stack majors

All test tooling together; they move in lockstep.

| Package | From → To | Where |
|---|---|---|
| `vitest` | 4.0.17 → 5.1.1 | root + three packages |
| `@vitest/coverage-v8` | 4.0.18 → 5.1.1 | root |
| `@vitest/ui` | 4.0.17 → 5.1.1 | root |
| `happy-dom` | 20.3.4 → 21.0.4 | root |
| `jsdom` | 27.4.0 → 31.0.1 | `di-react` — four majors, check breaking changes |
| `@testing-library/dom` | 10.4.1 → 10.4.2 | `di-react` |
| `@testing-library/react` | 16.3.1 → 16.3.3 | `di-react` |
| `@types/supertest` | 6.0.3 → 7.2.1 | several packages |
| `supertest` | 7.2.2 → 7.3.2 | several packages |

Verification: `yarn turbo run test:ci` must pass for every package. Pay attention to `@navios/di-react` specifically — the jsdom 27 → 31 jump is where DOM-timing regressions tend to show up.

### PR 4 — Tooling majors (Vite 8 + unplugin-swc 2)

| Package | From → To | Where |
|---|---|---|
| `vite` | 7.3.1 → 8.3.8 | `cli` dep |
| `vite-plugin-node` | 7.0.0 → 8.0.0 | `cli` dep |
| `unplugin-swc` | 1.5.9 → 2.0.0 | root devDep (used by every package's `tsdown.config.mts`) |

Verification: `yarn turbo run build` must succeed everywhere. Scaffold a test project with `yarn navios` (from `@navios/cli`) and confirm it still starts under Vite 8.

### PR 5 — Fastify ecosystem

| Package | From → To | Where |
|---|---|---|
| `@fastify/multipart` | 9.4.0 → 10.1.9 | `adapter-fastify` |
| `fastify-type-provider-zod` | 6.1.0 → 7.0.0 | `adapter-fastify` |
| `zod-openapi` | 5.4.6 → 6.0.2 | `openapi` |
| `@fastify/cors` | 11.2.0 → 11.4.3 | `adapter-fastify` |
| `@fastify/swagger` | 9.6.1 → 9.9.5 | `adapter-fastify` |
| `fastify` | 5.7.1 → 5.12.8 | `adapter-fastify`, `openapi-fastify`, `otel-fastify` |
| `openapi-types` | already latest | — |

Read each major's release notes and migrate call sites. Verification: `yarn turbo run test:ci --filter=@navios/adapter-fastify` and the openapi/fastify packages.

### PR 6 — OpenTelemetry SDK 3

| Package | From → To | Where |
|---|---|---|
| `@opentelemetry/resources` | 2.4.0 → 3.1.1 | `otel` |
| `@opentelemetry/sdk-metrics` | 2.5.0 → 3.1.1 | `otel` |
| `@opentelemetry/exporter-metrics-otlp-http` | 0.210 → 0.301.2 | `otel` |
| `@opentelemetry/exporter-trace-otlp-http` | 0.210 → 0.301.2 | `otel` |

Single coordinated bump inside `@navios/otel`. Read the SDK 3 migration guide and adjust metric/resource construction as needed. `@opentelemetry/api` and `sdk-trace-node` already moved in PR 2.

### PR 7 — amqplib 2.x

| Package | From → To | Where |
|---|---|---|
| `amqplib` | 0.10.9 → 2.4.1 | `queues` (optional dep) |
| `@types/amqplib` | 0.10.8 → 0.10.8 | still latest |

Isolated to `@navios/queues`. Read the amqplib 1.x and 2.x release notes — the 0.10 → 2 jump covers two major version boundaries and the API changed. Expect to rewrite `packages/queues/src/adapters/amqp*` call sites. Rerun the queues tests and any examples that use the RabbitMQ adapter.

### PR 8 — TypeScript 7 and restore Dependabot

Last and alone. Every other upgrade should have landed before this one.

| Package | From → To | Where |
|---|---|---|
| `typescript` | 5.9.3 → 7.0.2 | root + every package that declares it + `apps/docs` (as `~5.9.3` → `~7.0.2`) |

Steps:
1. Update the version in every `package.json`.
2. Run `yarn turbo run check` across the workspace.
3. Fix each diagnostic. Do not widen types or disable rules to escape — if a tightening is substantive, bring it back to the design doc rather than papering over it inside the PR.
4. Run `yarn turbo run build && yarn test:ci`.
5. Re-check the `@microsoft/api-extractor` patch again — TS 7 may require another regeneration.
6. **Restore `.github/dependabot.yml`** to its pre-sweep configuration (daily schedule for `npm`) as a final commit of this PR.

## What's Left to the Builder

- Exact minor-version bumps at build time: the "current latest" table above was pulled on 2026-11-23. If a minor has been published between approval and execution, take that newer minor. Do not re-evaluate major jumps on your own — those were the design decision.
- The exact Bun version used in `.bun-version` and `engines.bun` in PR 1 — pick the oldest Bun release whose `bun test` ships stage-3 decorators natively, from the current Bun changelog.
- Deciding whether to keep, regenerate, or drop the `@microsoft/api-extractor` patch in PR 2 and again in PR 8 — judge by whether the build still succeeds without it.
- Whether to also re-run `oxfmt` repo-wide inside PR 2 as a separate commit or fold it into the version bump commit. Author's call; keep the PR green either way.
- Rewriting amqplib call sites in `@navios/queues` to the 2.x API in PR 7 — details are in the amqplib release notes, not in this document.
- Fixing TypeScript 7 diagnostics in PR 8 case by case, with the standing rule above about not escaping them.

## Builder-check calls recorded for the author to review

These items came out of the pre-handover builder check. They are the author's to confirm while reading the doc.

- **@types/bun scope** was undercounted in an earlier draft ("three packages"). Corrected to all six places where `@types/bun` is declared, matching the "every workspace dep on current latest" goal. `examples/otel-bun` sits further behind at `^1.2.12` and still joins the bump.
- **Peer ranges stay wide.** `@navios/react-query`'s `@tanstack/react-query: ^5.51.21` peer and `@navios/adapter-fastify`'s `fastify: ^5.6.0` peer are **not** raised, even though their dev deps move. Rationale: a monorepo-internal dev-dep bump should not force every downstream consumer into a new floor. `@navios/otel` continues to ship no peer for the OTel SDK packages it builds on top of; consumers install the SDK directly.
- **"CI green" wording softened.** An earlier draft said CI must be green between PRs. No PR-triggered workflow exists in `.github/workflows/`; adding one is out of scope. The verification rule is now local only, as stated under Constraints.

## Open questions for the author

None in this doc — Option A was selected, the eight-PR order is fixed, Bun is pinned, and Dependabot pauses for the sweep. If a PR breaks badly enough to warrant stopping, bring it back here before improvising.
