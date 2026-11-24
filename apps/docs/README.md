# Navios documentation

The documentation site at [navios.tech](https://navios.tech), built with [Rspress](https://rspress.rs).

## Commands

Run these from the repository root.

```bash
yarn workspace @navios/docs dev        # local dev server with hot reload
yarn workspace @navios/docs build      # static site in apps/docs/build
yarn workspace @navios/docs preview    # serve the built site
yarn workspace @navios/docs typecheck
```

## Layout

```
content/            Rspress root
  index.tsx         landing page
  docs/             markdown, one folder per section (server, builder, di, commander)
  public/           static files copied to the site root (CNAME, favicon, logo)
theme/              footer, brand colours and landing-page styles
sidebars.mts        sidebar for each section
rspress.config.ts   site config
scripts/            URL checks and the post-build step
```

## Adding or moving a page

- Add the markdown file under `content/docs/<section>/` and list its path in `sidebars.mts`. The
  sidebar label is the page's `title` frontmatter, or its first heading.
- Links are checked at build time: a link or anchor that points nowhere fails the build.
- If you rename or move a page, add the old path to `scripts/renamed-pages.mts` so the old URL
  redirects. Never remove a line from `scripts/url-baseline.txt`; add the new path to it instead.

## URLs

`yarn build` runs `scripts/finalize-build.mts` after Rspress. It moves each page to
`<path>/index.html`, so both `/docs/x` and `/docs/x/` work on GitHub Pages, and writes redirect
pages for the paths in `scripts/renamed-pages.mts`.

`node scripts/check-urls.mts build` verifies that every path in `scripts/url-baseline.txt` still
resolves in the build. The deploy workflow runs it before publishing.

## Deployment

Pushing to `main` with changes under `apps/docs` runs `.github/workflows/deploy-docs.yml`, which
builds the site and publishes it to GitHub Pages.
