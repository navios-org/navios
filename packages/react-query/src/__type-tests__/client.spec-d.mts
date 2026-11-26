import { builder } from '@navios/builder'
import {
  skipToken,
  useQueries,
  useQuery,
  useSuspenseQueries,
  useSuspenseQuery,
} from '@tanstack/react-query'
import { describe, expectTypeOf, test } from 'vitest'
import { z } from 'zod/v4'

import type { EndpointError, EndpointErrorType } from '@navios/builder'
import type { InfiniteData, QueryClient } from '@tanstack/react-query'

import { declareClient } from '../index.mjs'

import type { SurfaceData } from '../index.mjs'

declare const queryClient: QueryClient

const api = builder()
const client = declareClient({ api })

const userSchema = z.object({ id: z.string(), name: z.string() })
type User = z.output<typeof userSchema>

const getUserEndpoint = api.declareEndpoint({
  method: 'GET',
  url: '/users/$userId',
  querySchema: z.object({ expand: z.string().optional() }),
  responseSchema: userSchema,
  errorSchema: { 404: z.object({ message: z.string() }) },
})
const getUser = client.query(getUserEndpoint)
const listUsers = client.query({
  method: 'GET',
  url: '/users',
  responseSchema: z.array(userSchema),
})

describe('client.query', () => {
  test('data and error are typed from the endpoint', () => {
    const result = getUser.use({ urlParams: { userId: 1 } })
    expectTypeOf(result.data).toEqualTypeOf<User | undefined>()
    expectTypeOf(result.error).toEqualTypeOf<EndpointErrorType<typeof getUserEndpoint> | null>()

    const { error } = result
    if (error && error.kind === 'http') {
      expectTypeOf(error.status).toEqualTypeOf<404>()
      expectTypeOf(error.body).toEqualTypeOf<{ message: string }>()
    }
    expectTypeOf(result.error).toExtend<EndpointError | null>()

    expectTypeOf(getUser.useSuspense({ urlParams: { userId: 1 } }).data).toEqualTypeOf<User>()
  })

  test('inline and from-endpoint declarations give the same shape', () => {
    const inline = client.query({
      method: 'GET',
      url: '/users/$userId',
      querySchema: z.object({ expand: z.string().optional() }),
      responseSchema: userSchema,
      errorSchema: { 404: z.object({ message: z.string() }) },
      keyPrefix: ['tenant'],
    })
    expectTypeOf(inline.use({ urlParams: { userId: 1 } }).data).toEqualTypeOf<User | undefined>()
    expectTypeOf(inline.endpoint.config.url).toEqualTypeOf<'/users/$userId'>()
    expectTypeOf(getUser.endpoint).toEqualTypeOf(getUserEndpoint)
  })

  test('args: required when the endpoint needs them, optional otherwise', () => {
    listUsers.use()
    listUsers.useSuspense()
    listUsers()
    void listUsers.fetch(queryClient)
    // @ts-expect-error urlParams is required
    getUser.use()
    // @ts-expect-error urlParams is required
    void getUser.fetch(queryClient)
    // @ts-expect-error wrong param name
    getUser.use({ urlParams: { id: 1 } })
    // @ts-expect-error responseSchema is required for a JSON query
    client.query({ method: 'GET', url: '/users' })
  })

  test('hooks accept TanStack options, select and skipToken', () => {
    const selected = getUser.use(
      { urlParams: { userId: 1 } },
      { staleTime: 1000, enabled: true, select: (user) => user.name },
    )
    expectTypeOf(selected.data).toEqualTypeOf<string | undefined>()

    const maybeId = null as number | null
    getUser.use(maybeId === null ? skipToken : { urlParams: { userId: maybeId } })
    // @ts-expect-error queryKey is owned by the library
    getUser.use({ urlParams: { userId: 1 } }, { queryKey: ['x'] })
    // @ts-expect-error skipToken is not allowed with suspense
    getUser.useSuspense(skipToken)
  })

  test('cache helpers are typed', async () => {
    const args = { urlParams: { userId: 1 } }
    expectTypeOf(await getUser.fetch(queryClient, args)).toEqualTypeOf<User>()
    expectTypeOf(await getUser.ensure(queryClient, args)).toEqualTypeOf<User>()
    expectTypeOf(await getUser.prefetch(queryClient, args)).toEqualTypeOf<void>()
    expectTypeOf(getUser.getData(queryClient, args)).toEqualTypeOf<User | undefined>()
    getUser.setData(queryClient, args, (old) => {
      expectTypeOf(old).toEqualTypeOf<User | undefined>()
      return old
    })
    // @ts-expect-error wrong data shape
    getUser.setData(queryClient, args, { id: 1 })
    expectTypeOf(
      await getUser.invalidate(queryClient, { urlParams: { userId: 1 } }),
    ).toEqualTypeOf<void>()
    void getUser.invalidate(queryClient, undefined, { exact: true, refetchType: 'none' })
  })

  test('keys carry the data type for queryClient calls', () => {
    const key = getUser.key({ urlParams: { userId: 1 } })
    expectTypeOf(queryClient.getQueryData(key)).toEqualTypeOf<User | undefined>()
    expectTypeOf(
      queryClient.getQueryData(getUser({ urlParams: { userId: 1 } }).queryKey),
    ).toEqualTypeOf<User | undefined>()
  })

  test('non-JSON endpoints', () => {
    const download = client.query({ method: 'GET', url: '/files/$id', response: 'blob' })
    expectTypeOf(download.use({ urlParams: { id: 1 } }).data).toEqualTypeOf<Blob | undefined>()
  })
})

describe('query options with the multi-query hooks', () => {
  test('are accepted by useQueries and useSuspenseQueries', () => {
    // Type-level only: hooks cannot run outside a component.
    const component = () => {
      const [user, users] = useQueries({
        queries: [getUser({ urlParams: { userId: 1 } }), listUsers()],
      })
      expectTypeOf(user.data).toEqualTypeOf<User | undefined>()
      expectTypeOf(users.data).toEqualTypeOf<User[] | undefined>()
      if (user.error?.kind === 'http') {
        expectTypeOf(user.error.status).toEqualTypeOf<404>()
      }

      const [suspended] = useSuspenseQueries({
        queries: [getUser({ urlParams: { userId: 1 } })],
      })
      expectTypeOf(suspended.data).toEqualTypeOf<User>()

      const mapped = useQueries({
        queries: [1, 2].map((userId) => getUser({ urlParams: { userId } })),
      })
      expectTypeOf(mapped[0]?.data).toEqualTypeOf<User | undefined>()

      const single = useQuery(getUser({ urlParams: { userId: 1 } }))
      expectTypeOf(single.data).toEqualTypeOf<User | undefined>()
      const singleSuspense = useSuspenseQuery(getUser({ urlParams: { userId: 1 } }))
      expectTypeOf(singleSuspense.data).toEqualTypeOf<User>()
    }
    expectTypeOf(component).toBeFunction()
  })
})

describe('unknown options', () => {
  test('are rejected on every inline declaration', () => {
    // With two overloads TypeScript reports the mismatch on the first property.
    client.query({
      // @ts-expect-error `unwrap` is not an option
      method: 'GET',
      url: '/users',
      responseSchema: z.array(userSchema),
      unwrap: 'throw-on-error',
    })
    client.mutation({
      // @ts-expect-error `useKey` is not an option
      method: 'POST',
      url: '/users',
      responseSchema: userSchema,
      useKey: true,
    })
    client.infiniteQuery({
      method: 'GET',
      url: '/feed',
      querySchema: z.object({ page: z.number() }),
      responseSchema: z.array(userSchema),
      getNextPageParam: () => undefined,
      // @ts-expect-error typo: the option is keyPrefix
      keyPrefx: ['x'],
    })
  })
})

describe('withResponse', () => {
  type Meta = { status: number; statusText: string; headers: Record<string, string> }

  test('wraps query data, inline and from an endpoint', () => {
    const fromEndpoint = client.query(getUserEndpoint, { withResponse: true })
    expectTypeOf(fromEndpoint.use({ urlParams: { userId: 1 } }).data).toEqualTypeOf<
      { data: User; response: Meta } | undefined
    >()
    const inline = client.query({
      method: 'GET',
      url: '/users',
      responseSchema: z.array(userSchema),
      withResponse: true,
    })
    expectTypeOf(inline.useSuspense().data).toEqualTypeOf<{ data: User[]; response: Meta }>()
    expectTypeOf(getUser.use({ urlParams: { userId: 1 } }).data).toEqualTypeOf<User | undefined>()
  })

  test('wraps mutation data and infinite pages', () => {
    const create = client.mutation({
      method: 'POST',
      url: '/users',
      responseSchema: userSchema,
      withResponse: true,
      onSuccess: (result) => {
        expectTypeOf(result).toEqualTypeOf<{ data: User; response: Meta }>()
      },
    })
    expectTypeOf(create().data).toEqualTypeOf<{ data: User; response: Meta } | undefined>()

    const feed = client.infiniteQuery({
      method: 'GET',
      url: '/feed',
      querySchema: z.object({ page: z.number() }),
      responseSchema: z.array(userSchema),
      withResponse: true,
      getNextPageParam: (lastPage) => {
        expectTypeOf(lastPage).toEqualTypeOf<{ data: User[]; response: Meta }>()
        return lastPage.response.headers['x-next'] ? { page: 2 } : undefined
      },
    })
    expectTypeOf(feed.useSuspense({ params: { page: 1 } }).data.pages).toEqualTypeOf<
      { data: User[]; response: Meta }[]
    >()
  })

  test('SurfaceData is the data of an endpoint, wrapped with withResponse', () => {
    type Options = (typeof getUserEndpoint)['config']
    expectTypeOf<SurfaceData<Options, false>>().toEqualTypeOf<User>()
    expectTypeOf<SurfaceData<Options, true>>().toEqualTypeOf<{ data: User; response: Meta }>()
  })
})

describe('client.infiniteQuery', () => {
  const pageSchema = z.object({ items: z.array(userSchema), next: z.number().nullable() })
  type Page = z.output<typeof pageSchema>

  const feed = client.infiniteQuery({
    method: 'GET',
    url: '/feed',
    querySchema: z.object({ page: z.number() }),
    responseSchema: pageSchema,
    getNextPageParam: (lastPage, pages, lastParam) => {
      expectTypeOf(lastPage).toEqualTypeOf<Page>()
      expectTypeOf(pages).toEqualTypeOf<Page[]>()
      expectTypeOf(lastParam).toEqualTypeOf<{ page: number }>()
      return lastPage.next === null ? undefined : { page: lastPage.next }
    },
  })

  test('data is InfiniteData of pages', async () => {
    type Data = InfiniteData<Page, { page: number }>
    expectTypeOf(feed.use({ params: { page: 1 } }).data).toEqualTypeOf<Data | undefined>()
    expectTypeOf(feed.useSuspense({ params: { page: 1 } }).data).toEqualTypeOf<Data>()
    expectTypeOf(await feed.fetch(queryClient, { params: { page: 1 } })).toEqualTypeOf<Data>()
    expectTypeOf(feed.getData(queryClient, { params: { page: 1 } })).toEqualTypeOf<
      Data | undefined
    >()
    const selected = feed.use({ params: { page: 1 } }, { select: (data) => data.pages.length })
    expectTypeOf(selected.data).toEqualTypeOf<number | undefined>()
  })

  test('requires a querySchema and getNextPageParam', () => {
    // @ts-expect-error getNextPageParam is required
    client.infiniteQuery({
      method: 'GET',
      url: '/feed',
      querySchema: z.object({ page: z.number() }),
      responseSchema: pageSchema,
    })
    const noQuery = api.declareEndpoint({ method: 'GET', url: '/feed', responseSchema: pageSchema })
    // @ts-expect-error the endpoint has no querySchema
    client.infiniteQuery(noQuery, { getNextPageParam: () => undefined })
  })
})

describe('client.mutation', () => {
  const updateUser = client.mutation({
    method: 'PATCH',
    url: '/users/$userId',
    requestSchema: z.object({ name: z.string() }),
    responseSchema: userSchema,
    errorSchema: { 409: z.object({ reason: z.string() }) },
    useContext: () => ({ toast: (message: string) => message }),
    onMutate: (variables, context) => {
      expectTypeOf(variables.urlParams).toEqualTypeOf<{ userId: string | number }>()
      expectTypeOf(variables.data).toEqualTypeOf<{ name: string }>()
      expectTypeOf(context.client).toEqualTypeOf<QueryClient>()
      expectTypeOf(context.toast).toEqualTypeOf<(message: string) => string>()
      return { startedAt: 1 }
    },
    onSuccess: (data, _variables, context) => {
      expectTypeOf(data).toEqualTypeOf<User>()
      expectTypeOf(context.onMutateResult).toEqualTypeOf<{ startedAt: number } | undefined>()
    },
    onError: (error) => {
      if (error.kind === 'http') {
        expectTypeOf(error.body).toEqualTypeOf<{ reason: string }>()
      }
    },
    invalidates: [
      listUsers,
      (data, variables) => {
        expectTypeOf(data).toEqualTypeOf<User>()
        return getUser.key({ urlParams: variables.urlParams })
      },
    ],
    optimistic: (update) =>
      update(getUser, {
        args: (variables) => ({ urlParams: variables.urlParams }),
        update: (current, variables) => {
          expectTypeOf(current).toEqualTypeOf<User | undefined>()
          return current && { ...current, name: variables.data.name }
        },
      }),
  })

  test('optimistic args are required when the query has required inputs', () => {
    client.mutation({
      method: 'POST',
      url: '/users',
      responseSchema: userSchema,
      optimistic: (update) => [
        update(listUsers, { update: (current) => current }),
        // @ts-expect-error getUser needs urlParams, so `args` is required
        update(getUser, { update: (current) => current }),
      ],
    })
  })

  test('hook result is typed', () => {
    const mutation = updateUser()
    expectTypeOf(mutation.data).toEqualTypeOf<User | undefined>()
    expectTypeOf(mutation.context).toEqualTypeOf<{ startedAt: number } | undefined>()
    mutation.mutate({ urlParams: { userId: 1 }, data: { name: 'x' } })
    // @ts-expect-error data is required
    mutation.mutate({ urlParams: { userId: 1 } })
    if (mutation.error?.kind === 'http') {
      expectTypeOf(mutation.error.status).toEqualTypeOf<409>()
    }
    expectTypeOf(updateUser.mutationKey).toEqualTypeOf<readonly unknown[]>()
    expectTypeOf(updateUser.useIsMutating({ urlParams: { userId: 1 } })).toEqualTypeOf<boolean>()
  })

  test('variables are optional when the endpoint requires nothing', () => {
    const ping = client.mutation({ method: 'POST', url: '/ping', response: 'void' })
    const mutation = ping()
    mutation.mutate()
    expectTypeOf(mutation.data).toEqualTypeOf<undefined>()
  })

  test('from an existing endpoint, including multipart', () => {
    const uploadEndpoint = api.declareEndpoint({
      method: 'POST',
      url: '/files',
      body: 'multipart',
      requestSchema: z.object({ file: z.instanceof(File) }),
      responseSchema: z.object({ id: z.string() }),
    })
    const upload = client.mutation(uploadEndpoint, {
      onSuccess: (data) => {
        expectTypeOf(data).toEqualTypeOf<{ id: string }>()
      },
    })
    upload().mutate({ data: { file: new File([], 'a') } })
    expectTypeOf(upload.endpoint).toEqualTypeOf(uploadEndpoint)
  })
})

describe('TanStack options on a declaration', () => {
  test('are typed, with callbacks typed from the endpoint', () => {
    const getReport = client.query({
      method: 'GET',
      url: '/reports/$id',
      responseSchema: userSchema,
      errorSchema: { 404: z.object({ message: z.string() }) },
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      retry: (count, error) => {
        expectTypeOf(count).toEqualTypeOf<number>()
        expectTypeOf(error.kind).toEqualTypeOf<EndpointError['kind']>()
        return error.kind === 'network' && count < 3
      },
      enabled: (query) => {
        expectTypeOf(query.state.data).toEqualTypeOf<User | undefined>()
        return true
      },
    })
    expectTypeOf(getReport.use({ urlParams: { id: 1 } }).data).toEqualTypeOf<User | undefined>()

    client.query(getUserEndpoint, { staleTime: 1000, gcTime: Infinity, keyPrefix: ['users'] })
    client.infiniteQuery({
      method: 'GET',
      url: '/feed',
      querySchema: z.object({ page: z.number() }),
      responseSchema: z.array(userSchema),
      getNextPageParam: (_last, _pages, param) => ({ page: param.page + 1 }),
      staleTime: 30_000,
      maxPages: 5,
    })
  })

  test('leave select to the call site', () => {
    client.query(getUserEndpoint, {
      // @ts-expect-error select belongs to the call site
      select: (user: User) => user.name,
    })
  })
})

describe('a builder with shared error schemas', () => {
  const sharedApi = builder({
    errorSchema: { 401: z.object({ error: z.object({ message: z.string() }) }) },
  })
  const sharedClient = declareClient({ api: sharedApi })

  test('types the errors of inline declarations with them', () => {
    const getMe = sharedClient.query({
      method: 'GET',
      url: '/me',
      responseSchema: userSchema,
      errorSchema: { 404: z.object({ message: z.string() }) },
    })
    const error = getMe.use().error
    if (error?.kind === 'http' && error.status === 401) {
      expectTypeOf(error.body).toEqualTypeOf<{ error: { message: string } }>()
    }
    if (error?.kind === 'http' && error.status === 404) {
      expectTypeOf(error.body).toEqualTypeOf<{ message: string }>()
    }

    sharedClient.mutation({
      method: 'POST',
      url: '/sessions',
      responseSchema: z.any(),
      onError: (failure) => {
        if (failure.kind === 'http') expectTypeOf(failure.status).toEqualTypeOf<401>()
      },
    })
  })

  test('types endpoints declared on the builder the same way', () => {
    const getMe = sharedClient.query(
      sharedApi.declareEndpoint({ method: 'GET', url: '/me', responseSchema: userSchema }),
    )
    type Failure = NonNullable<ReturnType<typeof getMe.use>['error']>
    expectTypeOf<Extract<Failure, { kind: 'http' }>['status']>().toEqualTypeOf<401>()
  })
})
