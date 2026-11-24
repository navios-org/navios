# Dependency Sweep Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring every workspace dependency in `packages/*`, `lab-packages/*`, `apps/*`, and `examples/*` to its current latest version, remove the Bun decorator workaround (now unnecessary because Bun supports stage-3 decorators natively), and ship the whole sweep as eight bisectable PRs that land on `main` in order.

**Architecture:** Grouped-by-domain upgrade. Eight PRs land sequentially, each verified locally before the next begins. Low-risk minors go together, then testing stack majors, then tooling majors, then Fastify, OpenTelemetry SDK 3, amqplib 2, and finally TypeScript 7 alone at the end. Bun is pinned and Dependabot is paused as part of PR 1; Dependabot is restored in PR 8.

**Tech Stack:** Yarn 4.12, Turbo 2.x, TypeScript (5.9 → 7), Vitest (4 → 5), Bun (native decorators), tsdown + unplugin-swc, @navios/* workspace packages.

**Spec:** [`docs/plans/2026-11-23-dependency-sweep-design.md`](./2026-11-23-dependency-sweep-design.md). Read it first; version tables and PR scopes live there and are not restated here.

## Global Constraints

- `yarn` (not `npm`) and `yarn turbo run <task> --filter=<pkg>` for per-package work.
- `.mts` source; `.spec.mts` unit tests; `.spec-d.mts` type tests.
- No semicolons, single quotes, oxlint config — lint must pass under the bumped `oxlint` / `oxfmt`.
- Each `@navios/*` package ships ESM + CJS via `tsdown`; both must build after each PR.
- Between every PR: `yarn install && yarn build && yarn turbo run check && yarn lint && yarn test:ci` must pass locally. No CI workflow enforces this today.
- Peer ranges on `@navios/react-query` (`@tanstack/react-query: ^5.51.21`) and `@navios/adapter-fastify` (`fastify: ^5.6.0`) stay wide. Dev-dep bumps do not raise these peers.
- `@navios/queues`'s `amqplib`, `@aws-sdk/*`, `amqp-connection-manager`, and `kafkajs` are **optional** peer deps; keep them optional.
- Commit message convention: Conventional Commits (`chore(deps):`, `feat:`, `fix:`, etc.) matching recent `main` history.
- Every commit ends with the attribution line `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>`. Every PR description ends with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

## Review Focus

Five input classes / failure modes the design implies but no task's tests exercise. Each line has a test added below to the task that owns the code.

1. **amqplib 2.x API drift** — a RabbitMQ consumer created via `@navios/queues` publishes and then acknowledges a message; API signatures changed between 0.10 and 2.x and the queues tests must cover both paths. *Owned by Task 7.*
2. **OpenTelemetry SDK 3 Resource construction** — `new Resource({ 'service.name': 'x' })` changed shape in SDK 3; `@navios/otel` must build a Resource and initialize the tracer provider under SDK 3. *Owned by Task 6.*
3. **Vitest 5 config format** — `vitest.config.mts` files may use deprecated options; running the full workspace test suite under Vitest 5 catches it. *Owned by Task 3.*
4. **Vite 8 plugin API with vite-plugin-node 8** — `@navios/cli` instantiates Vite with `vite-plugin-node`; a smoke test that scaffolds a project with `yarn navios` and starts it catches plugin-API breakage. *Owned by Task 4.*
5. **TypeScript 7 published `.d.ts` shape shift** — `tsdown`'s dts emit under TS 7 may change inferred types in surface signatures; a post-build check that re-runs type tests against the emitted `.d.mts` files for the five most-used public packages catches it. *Owned by Task 8.*

---

## Task 1: Drop Bun workaround, pin Bun, pause Dependabot

**Branch:** `chore/bun-workaround-and-sweep-prep`

**Files:**
- Modify: `.github/dependabot.yml` (flip `npm` schedule interval to `monthly`, or comment out the `npm` block and leave a note referencing this plan).
- Create: `.bun-version` (one line: the pinned Bun version).
- Modify: `packages/adapter-bun/package.json`, `packages/adapter-xml/package.json`, `packages/otel-bun/package.json` (add `"engines": { "bun": ">=<version>" }`; preserve existing `"engines"` if any).
- Modify: `examples/e2e-bun-stage3/package.json` (remove `chalk` and `esbuild` from `devDependencies`).
- Delete (21 files): all `bun-plugin.mts`, `bunfig.toml`, `bunPlugin.cache` files listed in the design doc under PR 1, plus `examples/simple-test/bunPlugin.reload.ts`.

**Interfaces:**
- Produces: a pinned minimum Bun version used by every later task that runs `bun test`.

**Steps:**

- [ ] **Step 1: Pick the pinned Bun version.** Check <https://github.com/oven-sh/bun/releases> for the oldest Bun release where `bun test` supports stage-3 decorators without a flag. Record it as `BUN_MIN`.
- [ ] **Step 2: Pause Dependabot.** Edit `.github/dependabot.yml`. Change the `npm` block's `schedule.interval` from `"daily"` to `"monthly"`. Leave a one-line `# Paused for dependency sweep — restore in PR 8 (see docs/plans/2026-11-23-dependency-sweep-plan.md)` comment above it.
- [ ] **Step 3: Commit.**
  ```bash
  git add .github/dependabot.yml
  git commit -m "chore(deps): pause Dependabot during dependency sweep"
  ```
- [ ] **Step 4: Pin Bun.** Write `BUN_MIN` into `.bun-version` at repo root. Add `"engines": { "bun": ">=<BUN_MIN>" }` to `packages/adapter-bun/package.json`, `packages/adapter-xml/package.json`, and `packages/otel-bun/package.json`.
- [ ] **Step 5: Verify Bun satisfies the pin.** Run `bun --version`; confirm it is `>= BUN_MIN`.
- [ ] **Step 6: Commit.**
  ```bash
  git add .bun-version packages/adapter-bun/package.json packages/adapter-xml/package.json packages/otel-bun/package.json
  git commit -m "chore(bun): pin minimum Bun version with native decorator support"
  ```
- [ ] **Step 7: Delete the workaround files.** Remove every file listed under PR 1 in the design doc. Verify the list:
  ```bash
  find . -name 'bun-plugin.mts' -not -path '*/node_modules/*'
  find . -name 'bunfig.toml' -not -path '*/node_modules/*'
  find . -name 'bunPlugin.*' -not -path '*/node_modules/*'
  ```
  All three must return no results.
- [ ] **Step 8: Remove dead devDeps.** Edit `examples/e2e-bun-stage3/package.json`; remove the `chalk` and `esbuild` lines from `devDependencies`.
- [ ] **Step 9: Reinstall.** Run `yarn install`. Lockfile updates stay in this commit.
- [ ] **Step 10: Verify Bun tests still pass without the preload.** Run:
  ```bash
  cd packages/adapter-bun && bun test
  cd ../otel-bun && bun test
  cd ../..
  ```
  Both must pass.
- [ ] **Step 11: Verify the rest of the workspace is green.** Run `yarn build && yarn turbo run check && yarn lint && yarn test:ci` at repo root. All must pass.
- [ ] **Step 12: Commit.**
  ```bash
  git add -A
  git commit -m "chore(bun): remove decorator-transpile workaround now that Bun has native support"
  ```
- [ ] **Step 13: Open PR.** Title: `chore: drop Bun decorator workaround, pin Bun, pause Dependabot`. Body includes a bullet per commit and a link to this plan. Wait for merge before starting Task 2.

---

## Task 2: Low-risk minor/patch bumps

**Branch:** `chore/deps-minor-sweep`

**Files:**
- Modify: every `package.json` listed in the PR 2 table of the design doc.
- Possibly modify: `.yarn/patches/@microsoft-api-extractor-npm-7.52.7-01efc6f1d0.patch` (regenerate) and root `package.json` `resolutions` key.

**Interfaces:**
- Consumes: `.bun-version` and `engines.bun` from Task 1.
- Produces: a baseline on which Task 3's testing-stack majors land cleanly.

**Steps:**

- [ ] **Step 1: Apply all minor/patch bumps.** For each row in the PR 2 table of the design doc, edit the listed `package.json` files to the new version. Use `yarn up` per-package where it maps cleanly; edit by hand where it doesn't (workspace-scoped deps).
- [ ] **Step 2: Reinstall.** Run `yarn install`.
- [ ] **Step 3: Handle the api-extractor patch.** Run `yarn build` across the workspace. If `tsdown`'s dts emit succeeds for every package that uses `@microsoft/api-extractor`, delete the patch file and remove the `resolutions` entry in root `package.json`; commit this as a separate "chore(deps): drop obsolete api-extractor patch" commit. If build fails on an `AstSymbolTable` symbol-not-found error, regenerate the patch against 7.60.1: `yarn patch @microsoft/api-extractor@npm:7.60.1`, re-apply the same diagnostic logging change, and update `resolutions` to `patch:@microsoft/api-extractor@npm%3A7.60.1#<new-patch-path>`.
- [ ] **Step 4: Re-run lint under new oxfmt/oxlint.** `yarn lint` from repo root. If `oxfmt` 0.79 reformats files beyond trivial whitespace, inspect each diff before accepting.
- [ ] **Step 5: Verify green.** Run `yarn build && yarn turbo run check && yarn lint && yarn test:ci`. All must pass.
- [ ] **Step 6: Commit (one commit, or split lint-reformat into its own commit — author's call).**
  ```bash
  git add -A
  git commit -m "chore(deps): bump low-risk minor and patch dependencies"
  ```
- [ ] **Step 7: Open PR** titled `chore(deps): bulk minor and patch sweep`. Body lists every bumped package with from→to versions, taken from the design doc's PR 2 table (updated for any newer minors published since 2026-11-23). Merge before starting Task 3.

---

## Task 3: Testing stack majors

**Branch:** `chore/deps-testing-stack`

**Files:**
- Modify: root `package.json` (`vitest`, `@vitest/coverage-v8`, `@vitest/ui`, `happy-dom`).
- Modify: `packages/adapter-xml/package.json`, `packages/di-react/package.json` (vitest + testing-library + jsdom), and every other package whose `devDependencies` include `vitest`, `@types/supertest`, or `supertest`.
- Possibly modify: `vitest.config.mts`, `vitest.e2e.fastify.config.mts`, `vitest.config.js` (migration to Vitest 5 config shape if options changed).

**Interfaces:**
- Consumes: baseline from Task 2.
- Produces: a workspace that runs under Vitest 5 and the current test-lib majors.

**Review Focus coverage — item 3 (Vitest 5 config format):**

- [ ] **RF-3 Step: Full workspace test suite under Vitest 5.** After the bump, run `yarn turbo run test:ci` from repo root. If any package errors with a deprecated-option message (`defineConfig`, `test.environment`, `test.poolOptions`, etc.), migrate that package's `vitest.config.mts` to the Vitest 5 shape per [Vitest 5 migration guide](https://vitest.dev/guide/migration). Every package must report 0 failed tests.

**Steps:**

- [ ] **Step 1: Bump versions.** Edit every affected `package.json` per the PR 3 table in the design doc.
- [ ] **Step 2: Reinstall.** `yarn install`.
- [ ] **Step 3: Full workspace test suite.** `yarn turbo run test:ci`. Migrate `vitest.config.mts` files as needed (see RF-3 Step).
- [ ] **Step 4: Verify green.** `yarn build && yarn turbo run check && yarn lint && yarn test:ci`.
- [ ] **Step 5: Commit + PR.**
  ```bash
  git add -A
  git commit -m "chore(deps): upgrade Vitest 5, happy-dom 21, jsdom 31, testing-library majors"
  ```

---

## Task 4: Tooling majors (Vite 8 + unplugin-swc 2)

**Branch:** `chore/deps-tooling-majors`

**Files:**
- Modify: `packages/cli/package.json` (`vite`, `vite-plugin-node`).
- Modify: root `package.json` (`unplugin-swc`).
- Possibly modify: `packages/*/tsdown.config.mts` (every package has one; unplugin-swc 2 API may have changed).
- Possibly modify: `packages/cli/src/*` (vite-plugin-node 8 may rename or change option shapes).

**Interfaces:**
- Consumes: baseline from Task 3.
- Produces: an `@navios/cli` runnable under Vite 8 and `tsdown` builds that work under `unplugin-swc` 2.

**Review Focus coverage — item 4 (Vite 8 + vite-plugin-node 8):**

- [ ] **RF-4 Step: `@navios/cli` smoke test.** After the bump:
  1. In a scratch folder outside the repo: `node /Volumes/Dev/Projects/navios/navios/packages/cli/lib/bin.mjs <scaffold-subcommand>` (use whichever scaffold subcommand exists in `@navios/cli`).
  2. From the scaffolded project, run the dev command and confirm the Vite dev server starts without errors.
  3. If `vite-plugin-node`'s option shape changed, update the plugin instantiation in `packages/cli/src/` accordingly.

**Steps:**

- [ ] **Step 1: Bump versions.** Per PR 4 table.
- [ ] **Step 2: Reinstall.** `yarn install`.
- [ ] **Step 3: Build everything.** `yarn build`. If `unplugin-swc` 2 errors in any `tsdown.config.mts`, read [unplugin-swc 2.0.0 release notes](https://github.com/unplugin/unplugin-swc/releases) and migrate.
- [ ] **Step 4: Run RF-4 Step above.**
- [ ] **Step 5: Verify green.** `yarn build && yarn turbo run check && yarn lint && yarn test:ci`.
- [ ] **Step 6: Commit + PR.**
  ```bash
  git add -A
  git commit -m "chore(deps): upgrade Vite 8, vite-plugin-node 8, unplugin-swc 2"
  ```

---

## Task 5: Fastify ecosystem

**Branch:** `chore/deps-fastify-eco`

**Files:**
- Modify: `packages/adapter-fastify/package.json` (`@fastify/cors`, `@fastify/multipart`, `@fastify/swagger`, `fastify`, `fastify-type-provider-zod`).
- Modify: `packages/openapi/package.json` (`zod-openapi`).
- Modify: `packages/openapi-fastify/package.json`, `packages/otel-fastify/package.json` (`fastify`).
- Possibly modify: `packages/adapter-fastify/src/*`, `packages/openapi/src/*` for API drift.

**Interfaces:**
- Consumes: baseline from Task 4.
- Produces: `@navios/adapter-fastify` and `@navios/openapi` that work under the latest Fastify majors.

**Steps:**

- [ ] **Step 1: Bump versions.** Per PR 5 table.
- [ ] **Step 2: Reinstall.** `yarn install`.
- [ ] **Step 3: Run Fastify-adjacent tests.** `yarn turbo run test:ci --filter=@navios/adapter-fastify --filter=@navios/openapi --filter=@navios/openapi-fastify --filter=@navios/otel-fastify`. Migrate call sites for any `@fastify/multipart` 10, `fastify-type-provider-zod` 7, or `zod-openapi` 6 API changes.
- [ ] **Step 4: Verify green.** Full `yarn build && yarn turbo run check && yarn lint && yarn test:ci`.
- [ ] **Step 5: Commit + PR.**
  ```bash
  git add -A
  git commit -m "chore(deps): upgrade Fastify ecosystem (@fastify/multipart 10, fastify-type-provider-zod 7, zod-openapi 6)"
  ```

---

## Task 6: OpenTelemetry SDK 3

**Branch:** `chore/deps-otel-sdk-3`

**Files:**
- Modify: `packages/otel/package.json` (`@opentelemetry/resources`, `@opentelemetry/sdk-metrics`, `@opentelemetry/exporter-metrics-otlp-http`, `@opentelemetry/exporter-trace-otlp-http`).
- Modify: `packages/otel/src/*` for SDK 3 API drift (Resource constructor, provider initialization).

**Interfaces:**
- Consumes: baseline from Task 5.
- Produces: `@navios/otel` that initializes OTel under SDK 3.

**Review Focus coverage — item 2 (OTel SDK 3 Resource construction):**

- [ ] **RF-2 Step: Write a test that builds a Resource and starts the tracer provider under SDK 3.** In `packages/otel/src/__tests__/` add or extend a spec that exercises:
  ```ts
  import { Resource } from '@opentelemetry/resources'
  import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node'
  // Build a Resource via the SDK 3 API (resourceFromAttributes or the constructor, whichever is current).
  // Start a NodeTracerProvider with it.
  // Assert the provider is active and the resource attributes round-trip.
  ```
  Run it: `yarn turbo run test:ci --filter=@navios/otel`. Must pass.

**Steps:**

- [ ] **Step 1: Bump versions.** Per PR 6 table.
- [ ] **Step 2: Reinstall.** `yarn install`.
- [ ] **Step 3: Read the SDK 3 migration guide.** <https://opentelemetry.io/docs/languages/js/migration/> for the current major. Note: `Resource` constructor changed; exporter package shapes changed.
- [ ] **Step 4: Migrate `packages/otel/src/*`.** Apply the API changes.
- [ ] **Step 5: Run RF-2 Step above.**
- [ ] **Step 6: Verify green.** `yarn build && yarn turbo run check && yarn lint && yarn test:ci`.
- [ ] **Step 7: Commit + PR.**
  ```bash
  git add -A
  git commit -m "chore(deps): upgrade OpenTelemetry SDK to 3.x"
  ```

---

## Task 7: amqplib 2.x

**Branch:** `chore/deps-amqplib-2`

**Files:**
- Modify: `packages/queues/package.json` (`amqplib`).
- Modify: `packages/queues/src/adapters/amqp*` for API drift between 0.10 and 2.x.

**Interfaces:**
- Consumes: baseline from Task 6.
- Produces: `@navios/queues` RabbitMQ adapter that works under `amqplib` 2.x; `amqplib` remains an optional peer.

**Review Focus coverage — item 1 (amqplib 2.x API drift):**

- [ ] **RF-1 Step: Round-trip test for the RabbitMQ adapter.** In `packages/queues/src/__tests__/` add a spec that:
  1. Instantiates the `@navios/queues` RabbitMQ adapter against a mocked `amqplib.connect` (or a real amqp-mock library — author's call).
  2. Publishes a message to a queue.
  3. Consumes the message.
  4. Acknowledges it.
  5. Asserts the mock saw `publish`, `consume`, and `ack` calls with expected arguments under the 2.x signatures.

  Run it: `yarn turbo run test:ci --filter=@navios/queues`. Must pass.

**Steps:**

- [ ] **Step 1: Bump versions.** `amqplib: ^0.10.9 → ^2.4.1` in `packages/queues/package.json` (both `optionalDependencies` and the `peerDependencies` `optionalDependencies` descriptor stay). `@types/amqplib` is already at latest; do not touch.
- [ ] **Step 2: Reinstall.** `yarn install`.
- [ ] **Step 3: Read release notes.** Check <https://github.com/amqp-node/amqplib/blob/main/CHANGELOG.md> for 1.0 and 2.0 breaking changes.
- [ ] **Step 4: Migrate adapter call sites.** Rewrite `packages/queues/src/adapters/amqp*` to the 2.x API. Likely points: `connect()` signature, `channel.assertQueue()`, consumer callback shape.
- [ ] **Step 5: Run RF-1 Step above.**
- [ ] **Step 6: Verify green.** `yarn build && yarn turbo run check && yarn lint && yarn test:ci`.
- [ ] **Step 7: Commit + PR.**
  ```bash
  git add -A
  git commit -m "chore(deps): upgrade amqplib to 2.x and migrate RabbitMQ adapter"
  ```

---

## Task 8: TypeScript 7 + restore Dependabot

**Branch:** `chore/deps-typescript-7`

**Files:**
- Modify: root `package.json` and every `package.json` that declares `typescript` (`packages/*`, `apps/docs`).
- Modify: `.github/dependabot.yml` (restore to pre-sweep).
- Possibly modify: `.yarn/patches/@microsoft-api-extractor-*.patch` (regenerate if TS 7 drifts it further).
- Possibly modify: any `.mts` source file that TS 7 flags with a new diagnostic.

**Interfaces:**
- Consumes: every prior task's baseline.
- Produces: the finished sweep — `main` under current latest TypeScript, Dependabot resumed.

**Review Focus coverage — item 5 (TS 7 published `.d.ts` shape shift):**

- [ ] **RF-5 Step: Post-build type-test pass against emitted `.d.mts`.** For the five most-used public packages (`@navios/core`, `@navios/di`, `@navios/builder`, `@navios/adapter-fastify`, `@navios/react-query`):
  1. After `yarn build`, write a one-off scratch `.spec-d.mts` in `/tmp/` (or a scratch dir) that imports from the package's **built** entrypoint (`lib/index.d.mts`) rather than the source.
  2. Re-run the public-surface type assertions already in the package's `.spec-d.mts` files, importing from the built path.
  3. `yarn tsc --noEmit <scratch file>` must pass.

  A shape drift between source `.mts` type tests (which still pass) and built `.d.mts` imports (which fail) means `tsdown`'s emit regressed under TS 7 and must be fixed inside this task before merging.

**Steps:**

- [ ] **Step 1: Bump TypeScript.** Edit every `package.json` with `"typescript": "^5.9.3"` → `"typescript": "^7.0.2"`. `apps/docs` uses `~5.9.3` → `~7.0.2`.
- [ ] **Step 2: Reinstall.** `yarn install`.
- [ ] **Step 3: Typecheck.** `yarn turbo run check`. Capture every diagnostic.
- [ ] **Step 4: Fix diagnostics one at a time.** Do not widen types, add `any`, add `@ts-ignore`, or disable rules. If a tightening is substantive (changes the public shape of a `@navios/*` package in a way consumers notice), stop and open a separate design-doc amendment before continuing. Otherwise, fix in place.
- [ ] **Step 5: Re-check the api-extractor patch.** Run `yarn build`. If it fails on `AstSymbolTable`, regenerate the patch against the api-extractor version resolved in Task 2.
- [ ] **Step 6: Build and test.** `yarn build && yarn test:ci`. Must pass.
- [ ] **Step 7: Run RF-5 Step above.**
- [ ] **Step 8: Restore Dependabot.** Edit `.github/dependabot.yml`: change `npm`'s `schedule.interval` back to `"daily"` and remove the "Paused for dependency sweep" comment.
- [ ] **Step 9: Final green check.** `yarn build && yarn turbo run check && yarn lint && yarn test:ci`.
- [ ] **Step 10: Commit + PR.**
  ```bash
  git add -A
  git commit -m "chore(deps): upgrade TypeScript to 7.x and restore Dependabot"
  ```

---

## Post-sweep check

After Task 8 merges, run one more full-workspace verification from a fresh clone:

```bash
git clone <repo> /tmp/navios-verify
cd /tmp/navios-verify
yarn install
yarn build
yarn turbo run check
yarn lint
yarn test:ci
```

All green closes the sweep. Dependabot's first post-sweep PR should be unremarkable; if it proposes rolling back something this sweep just raised, that is a bug in the Dependabot config to open a follow-up for.
