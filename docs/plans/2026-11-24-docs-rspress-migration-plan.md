# Docs Rspress Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Docusaurus with Rspress 2 in `apps/docs` without breaking any published URL, so the docs app stops contributing webpack/Babel advisories.

**Architecture:** `apps/docs` stays the `@navios/docs` workspace. Markdown moves under `apps/docs/content/docs` (the Rspress root is `content/`), navigation becomes native `_meta.json` files, and the landing page becomes a native Rspress custom page. A small post-build script writes redirect stubs so trailing-slash and renamed URLs keep working on GitHub Pages. Two check scripts written first act as the tests.

**Tech Stack:** `@rspress/core` ^2.1.4, `rspress-plugin-mermaid` 2.0.0 (pinned), React 19, TypeScript, Node 24, yarn 4, turbo.

**Spec:** `docs/plans/2026-11-24-docs-rspress-migration-design.md` — read it first. The working reference is the throwaway spike in `spikes/docs-rspress` (config, sidebar converter, landing-page shim); copy ideas from it, not files.

## Global Constraints

- Work on a branch `docs/rspress-migration` cut from `next`; the PR targets `next`.
- `yarn` and `turbo` only. No semicolons, single quotes, Oxlint. TypeScript files use `.mts` (React components `.tsx`; `rspress.config.ts` keeps the name Rspress looks for).
- Package stays `@navios/docs`, private, with a `build` script that writes to `apps/docs/build`.
- Move files with `git mv`.
- No `@docusaurus/*`, webpack or Babel dependency may remain because of the docs app.
- Nothing that imitates Docusaurus components, Infima classes or `--ifm-*` variables ships.
- No content rewrites beyond the link fixes and frontmatter removals named below.
- Verify every Rspress option name against the installed version's types (`node_modules/@rspress/shared/dist/index.d.ts`) before using it.
- A dependency-sweep worktree may touch `apps/docs/package.json`; rebase onto it if it lands first.

## Review Focus

- **Old URL with a hash** (`/docs/di/di/guides/scopes/#some-heading`): the redirect must keep the fragment. Pinned in Task 4.
- **Section index pages** (`/docs/server/`, `/docs/builder/`, `/docs/di/`): a real `index.html` already lives there; the stub writer must never overwrite an existing file. Pinned in Task 4.
- **Custom domain**: `CNAME` must be at the root of `build/`, and sitemap/canonical URLs must use `https://navios.tech`. Pinned in Task 2.
- **Landing page at phone width and in light mode**: the Infima grid is gone, so columns must still stack below ~996px and light mode must be readable. Pinned in Task 6.
- **Search on the built site** (not only in dev): a query for `Injectable` returns results from `yarn preview`. Pinned in Task 7.

---

### Task 1: Baselines and check scripts

**Files:**
- Create: `apps/docs/scripts/url-baseline.txt`
- Create: `apps/docs/scripts/sidebar-baseline.json`
- Create: `apps/docs/scripts/check-urls.mts`
- Create: `apps/docs/scripts/renamed-pages.mts`

**Interfaces:**
- Produces: `renamedPages: Record<string, string>` exported from `renamed-pages.mts`, mapping old public path to new, both without trailing slash:
  `/docs/builder/react-query/advanced/streams` → `/docs/builder/react-query/advanced/file-downloads`,
  `/docs/builder/react-query/guides/multipart-mutations` → `/docs/builder/react-query/guides/file-uploads`.
- Produces: `node scripts/check-urls.mts <buildDir>` — exit 0 when every baseline path resolves, otherwise exit 1 listing each failing path.

- [ ] **Step 1: Create the branch** `docs/rspress-migration` from `next`.

- [ ] **Step 2: Capture the URL baseline.** Build Docusaurus on this branch (`yarn workspace @navios/docs build`) and on `main` (use a temporary `git worktree`; remove it afterwards). From both `build/` trees, list every `index.html` as a public path without trailing slash (`build/docs/x/y/index.html` → `/docs/x/y`, `build/index.html` → `/`), drop `/404`, take the sorted union, and write it one per line to `url-baseline.txt`. Expected: 135 lines (132 docs + `/` on `next`, plus the 2 old paths that exist only on `main`). If the count differs, stop and report the difference.

- [ ] **Step 3: Capture the sidebar baseline.** Using the spike's `buildSidebar` (`spikes/docs-rspress/sidebars.ts`) on the current sidebar files, write `{ server, builder, di, commander }` as trees of `{ text, link }` / `{ text, collapsed, items }` to `sidebar-baseline.json`.

- [ ] **Step 4: Record the audit baseline.** Run `yarn npm audit -A -R --json | wc -l` and keep the number for the PR description (198 on 2026-11-24).

- [ ] **Step 5: Write `check-urls.mts`.** For each baseline path `p`, both `p` and `p + '/'` must resolve under GitHub Pages rules: `p` resolves if `<buildDir><p>.html` or `<buildDir><p>/index.html` exists; `p/` resolves only if `<buildDir><p>/index.html` exists. `/` resolves if `index.html` exists. For each key in `renamedPages`, the file that resolves must contain the mapped target path. Also fail if `<buildDir>/CNAME` is missing.

- [ ] **Step 6: Run it against the Docusaurus build to see it fail for the right reason.**

Run: `cd apps/docs && node scripts/check-urls.mts build`
Expected: exit 1, listing exactly the two renamed paths (both slash forms) and nothing else.

- [ ] **Step 7: Commit** `chore(docs): add URL and sidebar baselines for the Rspress migration`.

### Task 2: Swap the toolchain and move content

**Files:**
- Modify: `apps/docs/package.json`, `apps/docs/tsconfig.json`, `apps/docs/.gitignore`, `yarn.lock`
- Create: `apps/docs/rspress.config.ts`
- Move: `apps/docs/docs/**` → `apps/docs/content/docs/**`; `apps/docs/static/**` → `apps/docs/content/public/**`
- Rename: `content/docs/server/getting-started.md`, `content/docs/builder/intro.md`, `content/docs/di/intro.md` → `index.md` in the same folder, removing their `slug: /` line
- Delete: `apps/docs/docusaurus.config.ts`, `apps/docs/src/css/custom.css`, `content/public/img/docusaurus*.{png,jpg}`, `content/public/img/undraw_docusaurus_*.svg`

**Interfaces:**
- Produces: `yarn workspace @navios/docs build` writing a static site to `apps/docs/build`; scripts `dev`, `build`, `preview`, `typecheck`.

- [ ] **Step 1: Dependencies.** Remove every `@docusaurus/*` package, `@mdx-js/react`, `prism-react-renderer` and the `browserslist` block. Add `@rspress/core@^2.1.4` and `rspress-plugin-mermaid@2.0.0`. Keep `react`, `react-dom`, `clsx`, `typescript`. Add `"type": "module"`. Scripts: `dev: rspress dev`, `build: rspress build`, `preview: rspress preview`, `typecheck: tsc --noEmit`. Replace the `@docusaurus/tsconfig` extend with a self-contained config.

- [ ] **Step 2: Move content** with `git mv` as listed above. Before moving, keep `src/pages/index.tsx` and `index.module.css` in place; Task 6 ports them.

- [ ] **Step 3: Write `rspress.config.ts`** with: `root: 'content'`, `outDir: 'build'`, `title: 'Navios Framework'`, `description: 'Type-safe, decorator-based framework for building modern APIs'`, `icon: '/img/favicon.ico'`, `logo: '/img/logo.svg'`, `logoText: 'Navios'`, site origin `https://navios.tech` with sitemap on, dark mode as default with the switch enabled, the Mermaid plugin, `promql` aliased to `text` in the Shiki options, link and anchor checks **off for now** (Task 5 turns them on), a GitHub social link to `https://github.com/Arilas/navios`, edit links to `https://github.com/Arilas/navios/tree/main/apps/docs/content/`, and nav items Server → `/docs/server/`, Builder → `/docs/builder/`, DI → `/docs/di/`, Commander → `/docs/commander/getting-started`. Use a temporary placeholder `content/index.md` as the landing page.

- [ ] **Step 4: Update `.gitignore`** — drop `.docusaurus`, add `.rspress`; `build` stays ignored.

- [ ] **Step 5: Build and check.**

Run: `yarn install && yarn workspace @navios/docs build && cd apps/docs && node scripts/check-urls.mts build`
Expected: build succeeds; `build/CNAME` exists; `check-urls` fails only on trailing-slash forms and the two renamed paths (slash-less forms of all 133 current paths pass).

Run: `grep -cE '^"?(@docusaurus/|webpack@|@babel/core@)' yarn.lock`
Expected: `0`. If not, run `yarn why` on the hit and report which workspace still needs it.

- [ ] **Step 6: Commit** `feat(docs)!: replace Docusaurus with Rspress`.

### Task 3: Native sidebars

**Files:**
- Create: `_meta.json` files under `apps/docs/content/docs/{server,builder,di,commander}/**`
- Modify: every `.md` under `content/docs` (remove the `sidebar_position` line)
- Delete: `apps/docs/sidebars/`, `content/docs/server/guides/otel/_category_.json`

- [ ] **Step 1: Write the `_meta.json` files** so each section's sidebar reproduces `scripts/sidebar-baseline.json`: same groups, labels, order and default collapsed state. Page titles come from each page's `title` frontmatter or first heading, which is what the baseline used. Groups that are not backed by a directory use Rspress's custom-group form.

- [ ] **Step 2: Remove `sidebar_position`** from all frontmatter (drop the whole frontmatter block where that leaves it empty), and delete `sidebars/` and `_category_.json`.

- [ ] **Step 3: Verify order.** Build, run `yarn workspace @navios/docs preview`, and for one page in each of the four sections expand every sidebar group and read the sidebar links in DOM order.
Expected: for each section, the ordered list of link paths equals the flattened `link` values of that section in `sidebar-baseline.json`, and group labels match.

- [ ] **Step 4: Commit** `refactor(docs): define sidebars with _meta.json`.

### Task 4: Redirect stubs for old URLs

**Files:**
- Create: `apps/docs/scripts/write-redirects.mts`
- Modify: `apps/docs/package.json` (`build`), `.github/workflows/deploy-docs.yml`

**Interfaces:**
- Consumes: `renamedPages` from `scripts/renamed-pages.mts`.
- Produces: `node scripts/write-redirects.mts <buildDir>`; `build` becomes `rspress build && node scripts/write-redirects.mts build`.

- [ ] **Step 1: Extend the test first.** Add to `check-urls.mts`: every stub file (an `index.html` that the script wrote) contains a `<link rel="canonical">` pointing at `https://navios.tech<target>`, a meta refresh to `<target>`, and an inline script that calls `location.replace` with `<target>` plus the current `location.hash`. Run it; expected: still failing as after Task 2.

- [ ] **Step 2: Implement `write-redirects.mts`.** For every `<buildDir>/**/x.html` except `index.html` and `404.html`, write `<buildDir>/**/x/index.html` redirecting to the slash-less path, **only if that file does not already exist**. For each `renamedPages` entry, write both `<old>.html` and `<old>/index.html` redirecting to the new path. Print how many stubs were written.

- [ ] **Step 3: Bump the deploy workflow's `node-version` from `'20'` to `'24'`** so `node` runs `.mts` directly, as it does locally.

- [ ] **Step 4: Run the checks.**

Run: `yarn workspace @navios/docs build && cd apps/docs && node scripts/check-urls.mts build`
Expected: exit 0. `build/docs/server/index.html` is still the real Server page, not a stub.

- [ ] **Step 5: Commit** `feat(docs): keep trailing-slash and renamed URLs working`.

### Task 5: Fix broken links and enforce the check

**Files:**
- Modify: `apps/docs/rspress.config.ts`, and the source pages listed in the spec's appendix (paths now under `content/docs`)

- [ ] **Step 1: Turn dead-link and dead-anchor checks on** and build.
Expected: FAIL, reporting the 18 links and 3 anchors from the spec's appendix (the list may differ slightly; treat the build output as the source of truth).

- [ ] **Step 2: Fix each one** by pointing it at the page or heading the author evidently meant (for example `/docs/di/guides/scopes` → `/docs/di/di/guides/scopes`; `/docs/server/getting-started` → `/docs/server/`). Where no such target exists (`/examples/openapi`, `/docs/packages/http/overview`, `/packages/jwt`), remove the link and keep its text. Change nothing else on the page. List every fix, old → new, for the PR description.

- [ ] **Step 3: Build.** Expected: PASS with the checks on; `check-urls` still exits 0.

- [ ] **Step 4: Commit** `fix(docs): repair broken links and fail the build on new ones`.

### Task 6: Landing page, brand colours, footer

**Files:**
- Create: `apps/docs/content/index.tsx`, `apps/docs/theme/home.module.css`, `apps/docs/theme/brand.css`, `apps/docs/theme/Footer.tsx` (plus whatever theme entry file Rspress needs to mount it)
- Modify: `apps/docs/rspress.config.ts`
- Delete: `apps/docs/src/`, the placeholder `content/index.md`

- [ ] **Step 1: Brand colours.** `theme/brand.css`, loaded as global styles, sets Rspress's brand variables to `#2563eb` (light) and `#22d3ee` (dark) with the shades from the old `custom.css` lines 22–28 and 46–52, and the dark background to `#020617` / `#0f172a`.

- [ ] **Step 2: Port the landing page** from `src/pages/index.tsx` to `content/index.tsx` as a custom page: same sections, copy, order and visual design. Replace `@docusaurus/Link` with Rspress's `Link`, `@theme/CodeBlock` with Rspress's runtime code block, `@theme/Heading` with plain heading elements, `@theme/Layout` with nothing, and `useDocusaurusContext` with constants. Replace the Infima classes (`container`, `row`, `col`, `col--4`, `col--6`, `hero`, `hero__title`, `hero__subtitle`, `button*`) with classes in `home.module.css`, and every `--ifm-*` variable with a Rspress variable or a literal. Columns stack below 996px. Light and dark variants keep the gradients from the old `custom.css` lines 69–170.

- [ ] **Step 3: Footer.** A site-wide footer component with the same link columns as the old `themeConfig.footer` in `docusaurus.config.ts` (Documentation, Packages, More) and the line `Copyright © <year> Navios Framework.`

- [ ] **Step 4: Social card.** The old config pointed at `img/navios-social-card.png`, which does not exist. Set the Open Graph image to an existing image in `content/public/img` if one is suitable, otherwise omit the tag; say which in the PR description.

- [ ] **Step 5: Verify.**

Run: `grep -rnE "ifm-|@docusaurus|@theme/|data-theme" apps/docs --include='*.ts' --include='*.tsx' --include='*.css' --include='*.mts' --exclude-dir=node_modules --exclude-dir=build`
Expected: no output.

In `yarn workspace @navios/docs preview`, compare `/` against the current live landing page in dark and light mode at 1280px and 375px wide: all six sections present, tabs in the code example switch, the copy button works, columns stack at 375px, no horizontal scroll, footer links resolve. Build passes with link checks on; `typecheck` passes.

- [ ] **Step 6: Commit** `feat(docs): native landing page, brand theme and footer`.

### Task 7: Cleanup and final verification

**Files:**
- Modify: `apps/docs/README.md`, `.claude/launch.json`
- Delete: `spikes/docs-rspress/`, `apps/docs/scripts/sidebar-baseline.json`

- [ ] **Step 1: Rewrite `apps/docs/README.md`** for the new commands (`dev`, `build`, `preview`), the `content/` layout, `_meta.json` sidebars, and what `scripts/check-urls.mts` and `scripts/write-redirects.mts` do.

- [ ] **Step 2: Remove the spike** directory, the `docs-rspress-spike` launch entry and the sidebar baseline. Keep `url-baseline.txt`, `check-urls.mts` and `renamed-pages.mts`.

- [ ] **Step 3: Add the URL check to CI.** In `deploy-docs.yml`, run `node scripts/check-urls.mts build` (working directory `apps/docs`) after the build step, so a future rename without a redirect fails the deploy.

- [ ] **Step 4: Full verification.**

Run: `yarn install && yarn turbo run build --filter=@navios/docs && (cd apps/docs && node scripts/check-urls.mts build) && yarn workspace @navios/docs typecheck`
Expected: all pass. Run `yarn turbo run lint --filter=@navios/docs` if the package has a lint task.

Run: `yarn npm audit -A -R --json | wc -l`
Expected: about 68 or fewer (198 minus the 130 docs-only advisories); record before and after in the PR description, and list any advisory the new docs tree adds.

In `yarn workspace @navios/docs preview`, in dark and light: one page per section; `/docs/server/overview/request-lifecycle` shows a rendered Mermaid diagram; `/docs/commander/getting-started` shows titled callouts; search for `Injectable` returns results; a trailing-slash URL with a real heading anchor from that page (for example `/docs/di/di/guides/scopes/#<anchor>`) redirects to the slash-less URL with the same anchor; no console errors.

- [ ] **Step 5: Commit** `chore(docs): remove the Rspress spike and document the new setup`, then open a PR into `next` with the audit numbers, the link-fix list and the social-card note.
