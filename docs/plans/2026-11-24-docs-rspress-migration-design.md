# Docs: migrate from Docusaurus to Rspress — design

Date: 2026-11-24
Status: branch decided by the user (`next`); design calls shown to the user 2026-11-24

## Intent

`apps/docs` is built with Docusaurus 3. Its dependency tree (webpack, Babel, dev-server tooling) is the main
source of the advisories on the repository's vulnerabilities page, and the stack feels dated. Replace it with
Rspress 2 so the advisory noise goes away and the site runs on a current, smaller toolchain.

Measured on 2026-11-24 with `yarn npm audit -A -R`:

- The repo reports 198 advisories. 130 are in packages only `@navios/docs` pulls in (5 critical, 41 high).
  61 more are in packages shared between docs and other workspaces.
- A standalone Rspress build of the same content has 1 advisory (moderate, `minimatch`) and 388 packages,
  against 1,422 reachable from the Docusaurus app.

A throwaway spike in `spikes/docs-rspress` already builds all 132 doc pages and the landing page. It is reference
material only; nothing in it is kept as-is.

## Goals

- `apps/docs` builds with Rspress 2 (`@rspress/core`), and no `@docusaurus/*`, webpack or Babel package
  remains in `yarn.lock` because of the docs app.
- Every URL the site serves today still resolves to the same page.
- The site keeps its current structure: landing page at `/`, four sections (Server, Builder, DI, Commander)
  each with its own sidebar, dark mode by default with a light/dark switch.
- Broken links fail the build instead of producing a warning.
- The GitHub Pages deployment keeps working from `main` with the custom domain (`navios.tech`).

## Non-goals

- Rewriting or restructuring documentation content.
- Redesigning the landing page. It keeps its current sections and look.
- Type-checked code samples (Twoslash), versioned docs, translations, or a different host.
- Fixing the 61 advisories shared with other workspaces.

## Anti-goals

- A published URL that used to work returning 404.
- A conversion or sync step left in the final build (the spike has two; they exist only to avoid touching
  `apps/docs` during the experiment).
- Compatibility shims that imitate Docusaurus components or CSS classes in the shipped site.
- Swapping one large advisory stream for another: no dependency that brings webpack or Babel back.

## Constraints

- Repo rules: `yarn` 4 and `turbo`; no semicolons, single quotes, Oxlint.
- `apps/docs` stays the workspace `@navios/docs`, private, with a `build` script, because `yarn build`
  (turbo) and the deploy workflow call it.
- Deploy workflow (`.github/workflows/deploy-docs.yml`) uploads `apps/docs/build` and runs on pushes to
  `main` that touch `apps/docs/**`.
- Content is 132 plain `.md` files. The only Docusaurus-specific syntax is `:::` callouts (`tip`, `info`,
  `note`, `warning`, `important`, `caution`, some with titles) and Mermaid code blocks in 5 files. Both
  render under Rspress in the spike.
- Branch (decided by the user): the migration is built on `next`, which is 98 commits ahead of `main` and
  holds the docs rewritten for 2.0. The live site and the advisories on `main` change only when `next` is
  released.
- A dependency-sweep worktree (`.claude/worktrees/dep-sweep`) is in flight and may touch
  `apps/docs/package.json`. Land or rebase around it rather than racing it.

## Approaches

1. **Rspress 2 (chosen).** Rspack + React + MDX. The same model as Docusaurus: React landing page, a sidebar
   per section, `:::` callouts, built-in local search. Lowest migration cost; the spike confirmed content
   builds unchanged and the advisory count drops to 1.
2. **Astro Starlight.** Vite + Astro, polished defaults and a larger ecosystem. Needs a community plugin for
   per-section sidebars, remapping of some callout types, and the landing page ported to `.astro` or embedded
   through a React integration.
3. **VitePress.** Vite + Vue, smallest tree, per-section sidebars built in. The landing page would be
   rewritten in Vue, adding a Vue island to a React-leaning repo.

Rejected earlier: Fumadocs (needs Next.js and its own advisory stream) and staying on Docusaurus
(`@docusaurus/faster` is already on; webpack and Babel stay in the lockfile regardless).

The user picked Rspress after the comparison and confirmed after the spike.

## Design

Decisions below are the author's calls unless marked "decided by the user".

### Layout of `apps/docs`

Rspress routes by file path under one root directory, and the site needs both `/` and `/docs/...`, so the
root has to contain the `docs` folder.

```
apps/docs/
  rspress.config.ts
  package.json            # @navios/docs; scripts: dev, build, preview, typecheck
  tsconfig.json
  content/                # Rspress root
    index.tsx             # landing page (custom page)
    docs/
      server/ builder/ di/ commander/   # moved from apps/docs/docs with git mv
    public/               # from apps/docs/static: CNAME, favicon, logo, social card
  theme/ or styles/       # brand colours, landing-page styles, footer
```

- Move files with `git mv` so history follows.
- Output directory stays `build` (`outDir: 'build'`), so the deploy workflow and `.gitignore` do not change
  beyond removing `.docusaurus`.
- `CNAME` must end up at the root of the build output.

### URLs

- The three pages that use `slug: /` (`server/getting-started.md`, `builder/intro.md`, `di/intro.md`) become
  `index.md` in their section and lose the `slug` field, so `/docs/server/`, `/docs/builder/` and `/docs/di/`
  keep working.
- All other pages keep their file path.
- Trailing slashes. Docusaurus emits `docs/x/y/index.html`, so GitHub Pages serves `/docs/x/y/` and
  redirects `/docs/x/y` to it; the trailing-slash form is what is bookmarked and indexed. Rspress 2.1.4 emits
  `docs/x/y.html`, which serves `/docs/x/y` but returns 404 for `/docs/x/y/`, and has no directory-index
  output mode. Author's call: Rspress's slash-less URL becomes the canonical one, and a small post-build
  script writes a redirect stub at `docs/x/y/index.html` for every page (meta refresh plus
  `<link rel="canonical">` to the slash-less URL), so every old URL still lands on its page. This script is
  the one permitted post-build step; the anti-goal about conversion steps is about content and sidebars.
  If a newer Rspress release offers directory-index output, use that instead and drop the script.
- Renamed pages. On `next`, `builder/react-query/advanced/streams` became `file-downloads` and
  `builder/react-query/guides/multipart-mutations` became `file-uploads`. The live site (built from `main`)
  still serves the old paths. The same script writes redirect stubs from the two old paths to the new ones.

### Navigation

- Top nav: Server, Builder, DI, Commander, plus a GitHub link. Same targets as today.
- Sidebars: one per section, same grouping, order, labels and default collapsed state as the current
  `sidebars/*.ts`. Use Rspress's native `_meta.json` files rather than a converter. `sidebar_position`
  frontmatter, `_category_.json` and `sidebars/` are removed once the `_meta.json` files reproduce the order.
- `sidebars/packages.ts` is dead (its plugin is commented out and `docs/packages` does not exist); delete it.

### Look

- Rspress default theme with the Navios brand colours from `src/css/custom.css` (blue `#2563eb` in light,
  cyan `#22d3ee` in dark, dark slate backgrounds). The rest of the 612-line Infima stylesheet is not ported.
- Dark mode is the default; the switch stays.
- Landing page: same sections, copy and visual design as today, as a native Rspress custom page. Replace the
  five Docusaurus imports with Rspress equivalents or plain elements, and replace the Infima classes
  (`container`, `row`, `col--*`, `hero*`, `button*`) and `--ifm-*` variables with the page's own CSS module.
- Footer: today's footer is a multi-column list of docs sections and npm packages. Rspress has no equivalent
  built in. Keep the same links in a small custom footer component shown site-wide, with the copyright line
  reading "Copyright © <year> Navios Framework." (drop "Built with Docusaurus").
- Remove the unused Docusaurus stock images from `static/img`. The config references
  `img/navios-social-card.png`, which does not exist in `static/img`; use an existing image or drop the tag,
  and report which.

### Markdown

- Mermaid through `rspress-plugin-mermaid` (community plugin, version pinned), themed for light and dark.
- `promql` code blocks (one page) are aliased to plain text, since the highlighter has no grammar for it.
- Dead-link and dead-anchor checks are on. Fix the 18 broken links and 3 broken anchors that exist today
  (listed in the appendix) by pointing them at the page the author evidently meant; where no such page
  exists, remove the link and keep the text.
- "Edit this page" links point at `https://github.com/Arilas/navios/tree/main/apps/docs/content/...`.
- Search: Rspress built-in local search. `llms.txt` generation stays at its default (on).

### Dependencies and scripts

- Remove all `@docusaurus/*`, `@mdx-js/react`, `prism-react-renderer` and the `browserslist` block.
- Add `@rspress/core` and `rspress-plugin-mermaid`; keep `react`, `react-dom`, `clsx`, `typescript`.
- Scripts: `dev`, `build`, `preview`, `typecheck`. Update `apps/docs/README.md` to match.
- Deploy workflow: keep as is unless Rspress needs a newer Node than the `20` it pins; if so, bump it.

### Cleanup

- Delete `spikes/docs-rspress` and the `docs-rspress-spike` entry in `.claude/launch.json` when the
  migration is verified.

## Verification

- `yarn workspace @navios/docs build` passes with link and anchor checks enabled.
- URL parity: build Docusaurus from both `main` and the pre-migration commit. Every public path either
  serves (132 doc pages plus the landing page, with and without a trailing slash) resolves in the new build
  to the same page, directly or through a redirect stub. The 404 page is exempt. Check it against a local
  static server that mimics GitHub Pages (serves `x.html` for `/x` and `x/index.html` for `/x/`).
- `yarn npm audit -A -R` no longer lists any advisory whose only dependents come from the docs app's old
  tree; record the before and after counts in the PR.
- `yarn.lock` contains no `@docusaurus/`, `webpack@` or `@babel/core@` entry attributable to `apps/docs`.
- In a browser, in light and dark: landing page, one page per section, a page with a Mermaid diagram, a page
  with titled callouts, search returning a result, and the sidebar order of each section against the current
  site.
- `yarn turbo run lint --filter=@navios/docs` if the package has a lint task; `typecheck` passes.

## Left to the builder

- Exact Rspress config option names and route settings, verified against the installed version.
- File layout for styles and theme overrides.
- How the footer component is mounted.
- Order of work and commit boundaries.

## Appendix: links broken today

Dead links (source → target):

- `server/guides/openapi.md` → `/examples/openapi`
- `commander/best-practices.md` → `/docs/commander/guides`, `/docs/commander/recipes`
- `commander/getting-started.md` → `/docs/commander/recipes`
- `server/getting-started.md` → `/docs/builder/guides/defining-endpoints`, `/docs/di/getting-started`
- `server/overview/overview.md` → `/docs/builder/guides/defining-endpoints`
- `server/guides/controllers.md` → `/docs/builder/guides/defining-endpoints`
- `commander/api-reference.md` → `/docs/server/overview/architecture`
- `builder/intro.md` → `/docs/packages/http/overview`
- `server/guides/services.md` → `/docs/di/guides/injection-tokens`, `/docs/di/guides/factories`,
  `/docs/di/guides/scopes`
- `server/guides/testing.md` → `/docs/di/guides/testing`
- `server/overview/why-navios.md` → `/docs/server/getting-started`
- `server/adapters/bun.md` → `/server/faq/common-problems#es-decorators-support-in-bun`
- `server/recipes/authentication.md` → `/packages/jwt`
- `commander/guides/dependency-injection.md` → `/docs/di/di/getting-started`

Dead anchors:

- `commander/guides/testing` → `/docs/commander/api-reference#commanderapplication`
- `di/di/guides/circular-dependencies` → `/docs/di/di/guides/services#injection-methods`
- `server/faq/common-problems` → `/docs/server/guides/migrating-from-nestjs#step-2-configure-typescript`
