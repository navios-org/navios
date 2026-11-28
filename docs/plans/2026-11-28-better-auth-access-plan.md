# @navios/better-auth access decorators Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the session API of `@navios/better-auth` with access decorators and synchronous context keys, and rewrite the guide as a short recipe.

**Architecture:** Each decorator sets an `Access` attribute (and `Roles`) and attaches `BetterAuthGuard` with `@UseGuards`. The guard resolves the most specific access of the route, looks the session up once when needed, fills `CurrentUser` and `CurrentSession`, and refuses with 401 or 403.

**Tech Stack:** TypeScript (`.mts`), `@navios/server` attributes, guards and context keys, Better Auth 1.7, Vitest, Bun test for the example, Rspress docs.

**Spec:** `docs/plans/2026-11-27-better-auth-design.md` (section "Package API", access table)

## Global Constraints

- Breaking changes allowed; the package is unpublished, so the CHANGELOG entry of `2.0.0-alpha.2` is edited, not added to.
- No decorator syntax in package sources; no `zod` in the package (attribute schemas are inline Standard Schemas).
- Most specific declaration wins: `AttributeFactory.get(Access, ctx.route)`. No decorator: no check, no lookup.
- Statuses: no session where one is needed → 401 `Not signed in`; signed in on `@Guest()` → 403 `Already signed in`; role mismatch → 403.
- Roles come from `user.role`, split on `,` and trimmed.
- A refreshed session cookie Better Auth returns is still appended to `ctx.reply`.

## Review Focus

- A guard attached at module, controller and handler level looks the session up once.
- `@Public()` under a module `@Authenticated()` does no lookup at all.
- `@Guest()` under a module `@Roles('admin')` lets an anonymous request through.
- `CurrentUser` keeps the registered type in the published `.d.mts` (the example's `user.plan` compiles).
- Decorators work on a `handler()` field as well as on `@Endpoint` methods.

---

### Task 1: Access decorators, guard and context keys

**Files:**

- Create: `lab-packages/better-auth/src/access.mts` (`Access`, `RolesAttribute`, `Public`, `Authenticated`, `Guest`, `OptionalAuth`, `Roles`)
- Create: `lab-packages/better-auth/src/current-user.mts` (`CurrentUser`, `CurrentSession`, `AuthUser`, `AuthSessionRecord`)
- Rewrite: `lab-packages/better-auth/src/better-auth-guard.mts`
- Delete: `src/auth-session.mts`, `src/attributes.mts` (keep `OpenApiExclude` in `access.mts`)
- Modify: `src/better-auth-plugin.mts` (routes `@Public()` via `Access`), `src/index.mts`, `src/types.mts`
- Test: `src/__tests__/access.spec.mts` (replaces `session.spec.mts`), `src/__type-tests__/session.spec-d.mts`

**Interfaces:**

- Produces: `Authenticated(): Decorator`, `Guest(): Decorator`, `OptionalAuth(): Decorator`, `Public(): Decorator`, `Roles(...roles: [string, ...string[]]): Decorator`; `CurrentUser: PlainContextKey<AuthUser>`, `CurrentSession: PlainContextKey<AuthSessionRecord>`; `BetterAuthGuard`.

- [ ] Write tests for every row of the access table, the overrides (`@Public`/`@Guest` under module `@Authenticated`, `@Authenticated` on a handler under a public module), roles (single, comma list, mismatch, anonymous), one lookup with the guard at three levels, no lookup for public and undecorated routes, refreshed cookie, `CurrentSession`, decorators on a `handler()` field, `BetterAuthGuard` in `@Module({ guards })` with attributes, `Roles()` with no role failing at definition; type tests for `CurrentUser` and `SessionOf`.
- [ ] Run, see them fail; implement; run, see them pass; `yarn check`.

### Task 2: Example, README, CHANGELOG

- [ ] Example: `@Authenticated()` on `NotesController`, handlers read `ctx.get(CurrentUser)`; module without guards. `bun test` 9/9, `yarn check`.
- [ ] README "Protect routes" rewritten around the table; CHANGELOG entry edited.

### Task 3: The guide as a recipe

- [ ] Rewrite `apps/docs/content/docs/server/guides/better-auth.md`: set up (three short blocks), protect routes (table and one example), the current user, roles, typing, signing in from the front end with Better Auth's client, testing (short), reference. No internals, no curl.
- [ ] `yarn workspace @navios/docs build` passes; check the page in the preview.
