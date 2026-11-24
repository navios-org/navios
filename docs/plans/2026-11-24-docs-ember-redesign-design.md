# Docs: Ember redesign — design

Date: 2026-11-24
Status: approved by the user in conversation ("Go with Ember", "Go ahead and build it")

## Intent

The docs site looks like a stock theme with a cold blue palette. Give it its own look: a floating toolbar,
panels with rounded corners instead of full-height columns split by straight lines, soft gradient
atmosphere, and warm colours. Redesign the landing page in the same language.

## Approaches

1. **Styling plus small overrides in `theme/` (chosen).** Rspress's nav, sidebar and outline are restyled
   through CSS and theme variables; search, mobile navigation and the sidebar logic stay Rspress's.
2. **CSS variables only.** Changes colours but cannot produce the floating toolbar or panel layout.
3. **A fully custom theme.** Most freedom, but we would own search, mobile nav and the sidebar.

## Palette (decided by the user: "Ember")

| | Dark | Light |
|---|---|---|
| Page | `#0f0b0a` | `#fbf7f3` |
| Panel | `#1a1412` | `#ffffff` |
| Line | `#2e2420` | `#eadfd6` |
| Text | `#f5efe9` | `#1f1612` |
| Accent, gradient start | `#fb923c` | `#ea580c` |
| Accent, gradient end | `#f43f5e` | `#e11d48` |
| Link and brand text | `#fb923c` | `#c2410c` (the bright orange fails text contrast on cream) |

## Docs shell

- Toolbar: floating, rounded, inset from the top and sides, translucent with a blur, sticky.
- Sidebar: its own rounded panel; the current page is a tinted pill with an ember edge.
- Outline: no divider line; ember marker on the active heading.
- Background: two soft ember glows behind the toolbar that fade down the page.
- "Copy Markdown" and its "open in" menu are already rendered by Rspress; restyle only.
- Rounded code blocks with a warm syntax palette; callouts as tinted cards.
- Logo and favicon: same "N" mark, orange-to-rose gradient.
- Footer: same links, as a rounded panel.

## Landing page

Five sections, existing copy with tightened headlines:

1. Hero: headline with one gradient phrase, copyable install command, two buttons, code window with a glow.
2. Features as a grid of mixed-size tiles.
3. "One definition, three places": tabbed code walkthrough (define, serve, call).
4. Comparison table as a rounded card.
5. "Pick your pieces": ecosystem and packages merged into one grid, then a closing call to action.

## Author's calls

- Fonts unchanged. Dark stays the default. Docs content, sidebar structure and URLs untouched.

## Verification

- Browser check of the landing page and a docs page, dark and light, at 1440 and 375 wide.
- Build (link checks on), URL check, typecheck and Oxlint pass.
