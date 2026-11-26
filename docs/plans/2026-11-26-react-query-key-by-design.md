# React Query: choosing what identifies a cache entry (`keyBy`) — design

Date: 2026-11-26
Scope: `packages/react-query/src/**`, its README and CHANGELOG,
`apps/docs/content/docs/builder/react-query/keys-and-invalidation.md`,
`apps/docs/content/docs/builder/reference/react-query.md`.

## Intent

Every query key is `[...keyPrefix, method, url, ...keySuffix, markers, { urlParams, params, data }]`.
All three input parts always identify the entry. Some endpoints want fewer entries:

- a live search or a filter bar, where every component should show the result of the
  parameters sent last, without each one knowing them;
- a "current item" panel that shows whichever record was opened last;
- polling with a moving `since` or cursor parameter, which today creates one entry per poll;
- a `POST` query whose body should not split the cache.

The goal is to let a declaration say which inputs identify its entry, without handing out a
key function, and without the mistakes that dropping inputs from a key causes in TanStack Query.

## Goals

- A declarative option, typed from the endpoint (field names are checked).
- The defaults stay as they are: no option, no change in keys or behavior.
- Dropping an input from the key never shows a component data for inputs it did not ask for
  and did not see sent.
- The key keeps its shape, so `key()`, `invalidate()`, `invalidates` and optimistic updates keep
  their three scopes.

## Non-goals

- A key function or any other way to write a key by hand.
- Infinite queries. Their `params` are the first page; sharing them means resetting the page
  list when they change, which needs its own design.
- Mutations: their key has no inputs.

## Anti-goals

- A shared entry that silently keeps the old result when its inputs change (TanStack does not
  refetch when the key stays the same).
- Two declarations of one endpoint, one shared and one not, writing the same entry.

## What goes wrong when inputs are simply dropped from the key

Found while reading `@tanstack/query-core` 5.108:

1. **No refetch on change.** TanStack refetches when the key changes. With `params` out of the
   key, `use({ params: { q } })` keeps showing the first result when `q` changes.
2. **Imperative calls return the wrong data.** `fetch` and `ensure` return cached data while it is
   fresh, whatever parameters it was fetched with, and join an in-flight request made with
   other parameters.
3. **Refetches flip between components.** Every observer overwrites the query's `queryFn`
   (`QueryObserver.setOptions` → `query.setOptions`), focus refetches go through the first
   observer, and invalidation uses whichever `queryFn` was set last. Two components on one entry
   with different parameters take turns.
4. **Readers have to know the parameters.** The point of one entry is that a component can show it
   without knowing what was searched. The args type still requires them.
5. **Collisions.** `client.query(listUsers)` and `client.query(listUsers, { keyBy: { params: false } })`
   would both use `['GET', '/users']`.

RTK Query has this exact shape (`serializeQueryArgs` plus a separate `forceRefetch` you must not
forget), and point 1 is its best-known pitfall. Apollo's `keyArgs` is the declarative
precedent, and Apollo refetches when the variables change.

## Approaches

| Approach                                                                                                                                                             | For                                                                         | Against                                                                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. Key function** `queryKey: (args) => key`                                                                                                                        | Total control                                                               | Forget an input and two requests share data; breaks the prefix scopes and the key's data type; points 1–5 all on the developer. Rejected by the request.                                                        |
| **B. Inputs transform** `keyInputs: (inputs) => partial` (RTK `serializeQueryArgs`)                                                                                  | Key shape kept                                                              | Still a function that can drop anything; points 1–4 remain.                                                                                                                                                     |
| **C. Client-wide strategy** `declareClient({ defaults: { keyBy } })`                                                                                                 | One switch                                                                  | Changes what every declaration means without it showing at the declaration; field names cannot be typed without an endpoint; the hook types cannot follow without threading a generic through `ClientInstance`. |
| **D. Named presets** `keyBy: 'inputs' \| 'url' \| 'endpoint'`                                                                                                        | Smallest API                                                                | Cannot leave out only the body, or one parameter (the polling `since`).                                                                                                                                         |
| **E. Declarative parts and fields** `keyBy: false \| { urlParams?, params?, data? }`, each `boolean \| fieldNames[]`, and the library owns the shared-entry behavior | Typed field names; covers every case above; points 1–5 handled in one place | More logic in the library: a per-entry record of the inputs sent last.                                                                                                                                          |

**Chosen: E.** A–B hand the hard part to every call site. C is the wrong default for a change in
meaning this large; it can be added later without breaking anything if a real need shows up. D is
E without the field lists, and E reads the same for the common case
(`keyBy: { params: false }`).

## Design

### The option

On `client.query` (inline or with an endpoint) and `makeQuery`:

```ts
keyBy?:
  | false // no input identifies the entry: one entry for the endpoint
  | {
      urlParams?: boolean | readonly UrlParamName[]
      params?: boolean | readonly ParamName[]
      data?: boolean | readonly BodyFieldName[] // field lists only for object bodies
    }
```

`true` (the default) keeps a part, `false` leaves it out, a list keeps only those fields.

### The key

`[...keyPrefix, method, url, ...keySuffix, 'with-response'?, { keyBy }, inputs?]`

`{ keyBy }` is the normalized option written as one string (parts in a fixed order, field lists
sorted): `{ keyBy: 'params:false' }`, `{ keyBy: 'params:["role"]' }`, or `{ keyBy: false }` when no
input identifies the entry. A string, because TanStack matches objects and arrays partially, so
`{ params: ['role'] }` would match `{ params: ['role', 'sort'] }`. It keeps a
shared declaration's entries apart from a plain declaration of the same endpoint, as
`'with-response'` and `'infinite'` already do, and shows the rule in the devtools. A whole-endpoint
key (`query.key()` of the plain declaration) is still a prefix of it, so invalidating an endpoint
refreshes its shared entries too. A `keyBy` that leaves everything in adds no marker.

### Shared inputs

The inputs left out are the entry's **shared inputs**: a whole part for `false`, a single field
for a list. They are kept per entry of a `QueryClient` (a `WeakMap` on TanStack's `Query`, so they
go away with the entry).

- **Sending.** `use`, `useSuspense`, `fetch`, `prefetch` and `ensure` called with a shared input
  replace that input of the entry. "With" means the property is present, even as `undefined`, so
  `{ params: { q: undefined } }` clears `q`. If the entry's last request used other inputs, it
  refetches; every component on the entry gets the result. A hook sends on mount and whenever its
  shared inputs change, in a layout effect, so the first request of a mount already uses them. A
  disabled hook (`enabled: false`, `skipToken`) does not send.
- **Reading.** The same calls without shared inputs read the entry as it is. Any request they cause
  (mount, focus, invalidation) uses the inputs last sent, or none if nothing was sent yet.
- **One request function.** Every `queryFn` of the entry reads the shared inputs from the record, so
  it does not matter which observer's `queryFn` TanStack calls (point 3).
- **Requests overtaken by a change.** When a request resolves after the shared inputs changed, it is
  repeated with the new ones, so the entry never stores a result for inputs nobody holds (this
  covers TanStack joining an in-flight request).
- **What the record knows.** The inputs sent last (what every request uses), the inputs behind the
  entry's data (set only when a request of this client resolves without being cancelled), and the
  request in flight (trusted only while TanStack reports the entry fetching). Whether to fetch is
  decided by comparing what is sent with the inputs behind the data, never with what was sent
  before: a failed or cancelled request leaves the data, and so the record, as they were.
- **Hooks fetch the entry, not the observer.** The send runs in a layout effect, before TanStack's
  passive `setOptions`, so the observer still points at the previous render's entry. The hook calls
  `Query.fetch` on the entry it sent to, with `cancelRefetch`. `enabled` is resolved during
  render, so an inline function does not send on every render; `useSuspense` always counts as
  enabled.
- **Imperative calls.** `fetch` / `prefetch` / `ensure` that change the shared inputs ignore
  freshness and fetch; otherwise they behave as today (point 2).
- **Hydration.** The first inputs sent to an entry that no request in this `QueryClient` filled are
  trusted to match its data, so server-rendered entries are not fetched again.

### Types

- `use`, `useSuspense`, `fetch`, `prefetch`, `ensure`: shared inputs are optional, so a reader calls
  `search.use()`.
- The options a call returns (`search(args)`), `key`, `invalidate`, `getData`, `setData`: only the
  inputs that identify the entry. The options object cannot react to a change, so it cannot send;
  `getData` and `setData` address the entry, not one set of inputs. Accepting shared inputs there
  would suggest otherwise.
- `KeyBy<Options>` is exported; `QueryObject` gets a fourth type parameter for it, defaulting to the
  current behavior.

## Review

An independent review of the first implementation reproduced seven problems, all fixed with a
test each: the record compared sends with the inputs sent before instead of the inputs behind the
data (wrong data after a failed or cancelled request, and for a second concurrent `fetch`); the
hook refetched through an observer that still had the previous entry; an inline `enabled` function
re-sent on every render (and two such hooks looped); rule markers matched each other partially;
`useSuspense` read `enabled` from the declaration. A `fetch` cancelled with `revert` resolves with
the data it would have replaced, so `fetch` / `ensure` fetch once more when that data is for other
inputs.

## Left to the builder

- Effect ordering details, the exact normalization of the marker, test layout.
- The shared record does not travel through `dehydrate`; a client-side reader of a hydrated entry
  refetches with no shared inputs until one is sent, and hydrating over an entry that already has
  a record keeps it. Documented, not solved.
- While a request for new shared inputs runs, a hook sees the previous result as `success`
  (`isFetching` is true) and `useSuspense` does not suspend again. Documented; a placeholder
  state would need TanStack support.
