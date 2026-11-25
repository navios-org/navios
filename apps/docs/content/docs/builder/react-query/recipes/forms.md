---
title: Forms
---

# Forms

A form is a mutation plus a way to show what went wrong. This recipe covers the parts that are specific to these packages: mapping an `EndpointError` to field messages, deciding where success handling goes, and prefilling an edit form from the cache. It works with plain form elements and with any form library.

The examples use `createUser` as declared on Builder's [Errors](/docs/builder/essentials/errors) page, where its `errorSchema` describes a 409 and a 422 reply:

```ts
// client from the React Query quick start; usersQuery from Queries
export const useCreateUser = client.mutation(createUser, {
  invalidates: [usersQuery],
})
```

## Submit

Read the values from the form and pass them as `data`. The endpoint's `requestSchema` validates them, so the component does no checking of its own.

```tsx
function CreateUserForm() {
  const { mutate, isPending, error } = useCreateUser()
  const fieldErrors = fieldErrorsOf(error)

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        const form = new FormData(event.currentTarget)
        mutate({
          data: { name: String(form.get('name')), email: String(form.get('email')) },
        })
      }}
    >
      <input name="name" aria-invalid={'name' in fieldErrors} />
      {fieldErrors.name && <p role="alert">{fieldErrors.name}</p>}

      <input name="email" type="email" aria-invalid={'email' in fieldErrors} />
      {fieldErrors.email && <p role="alert">{fieldErrors.email}</p>}

      {error?.kind === 'http' && error.status === 409 && <p role="alert">{error.body.message}</p>}

      <button disabled={isPending}>{isPending ? 'Creating…' : 'Create user'}</button>
    </form>
  )
}
```

## Field errors from both sides

Two different failures mean "a field is wrong", and both arrive in the same `error`:

- `request-validation`: the input failed `requestSchema` in the browser and nothing was sent. `error.issues` lists each problem with its path.
- `http` with status 422: the server rejected the input. `error.body` has the shape the `errorSchema` declares, here `{ fields }`.

One function turns either into a record of messages by field name:

```ts
import type { EndpointErrorType } from '@navios/builder'

function fieldErrorsOf(error: EndpointErrorType<typeof createUser> | null): Record<string, string> {
  if (error?.kind === 'request-validation') {
    return Object.fromEntries(
      error.issues.map((issue) => [
        (issue.path ?? []).map(String).join('.'),
        issue.message,
      ]),
    )
  }
  if (error?.kind === 'http' && error.status === 422) return error.body.fields
  return {}
}
```

A path has the same form for every schema library. It is joined with dots here, so `['address', 'city']` becomes `address.city`.

Everything else, such as a network failure or a status you did not declare, is not a field error. Show `error.message` or a generic notice for those; [Errors](/docs/builder/react-query/errors#in-a-hook-result) has the pattern.

### Validating before submit

To validate on blur or on change, run the same schema yourself rather than writing the rules twice. The schema is on the endpoint's `config`:

```ts
const result = await createUser.config.requestSchema['~standard'].validate(values)
```

That is the [Standard Schema](/docs/builder/essentials/schemas) interface, so it works with any library. With Zod, the library these examples use, `safeParse` on the schema you declared does the same, and form libraries accept the schema directly through their resolvers.

## After success

Put what must always follow the mutation in its settings, and what belongs to one screen at the call site. Both run; the settings first.

```tsx
function CreateUserDialog({ onClose }: { onClose: () => void }) {
  const { mutate } = useCreateUser() // invalidates the list, every time

  const submit = (data: { name: string; email: string }) =>
    mutate({ data }, { onSuccess: onClose }) // closes this dialog, here only

  // ...
}
```

To navigate or show a toast from the settings, bring the hook in with [`useContext`](/docs/builder/react-query/mutations#adding-hooks-with-usecontext).

## Edit forms

Load the current values with the query and save with a mutation. Writing the response into the cache in `onSuccess` updates every component showing that user without a refetch.

```tsx
// userQuery from the React Query quick start; updateUser from "URL params, query and body"
export const useUpdateUser = client.mutation(updateUser, {
  invalidates: [usersQuery],
  onSuccess: (user, variables, context) => {
    userQuery.setData(context.client, { urlParams: variables.urlParams }, user)
  },
})

function EditUserForm({ userId }: { userId: string }) {
  const { data: user } = userQuery.useSuspense({ urlParams: { userId } })
  const { mutate, isPending } = useUpdateUser()

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        const name = String(new FormData(event.currentTarget).get('name'))
        mutate({ urlParams: { userId }, data: { name } })
      }}
    >
      <input name="name" defaultValue={user.name} />
      <button disabled={isPending}>Save</button>
    </form>
  )
}
```

`useSuspense` guarantees `user` is defined, so `defaultValue` is set on the first render. For a form that should feel instant, make the save [optimistic](/docs/builder/react-query/optimistic-updates) instead of waiting for `onSuccess`.
