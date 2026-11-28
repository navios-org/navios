import { createAuthEndpoint } from 'better-auth/api'

import type { BetterAuthPlugin } from 'better-auth'

/** The bodies Better Auth received, as text, captured before it parsed them. */
export const receivedBodies: string[] = []

/**
 * A Better Auth plugin with endpoints that show what forwarding has to keep:
 * a redirect with two cookies, an echo of the query and the body, and an
 * endpoint with a method and a depth Better Auth's own endpoints do not have.
 */
export function testPlugin() {
  return {
    id: 'navios-test',
    onRequest: async (request) => {
      if (request.method === 'POST') {
        receivedBodies.push(await request.clone().text())
      }
    },
    endpoints: {
      testRedirect: createAuthEndpoint('/test/redirect', { method: 'GET' }, async (ctx) => {
        ctx.setCookie('first', '1')
        ctx.setCookie('second', '2')
        throw ctx.redirect(String(ctx.query?.to ?? '/'))
      }),
      testEchoQuery: createAuthEndpoint('/test/echo', { method: 'GET' }, async (ctx) =>
        ctx.json({ query: ctx.query ?? null }),
      ),
      testEchoBody: createAuthEndpoint(
        '/test/echo',
        {
          method: 'POST',
          metadata: {
            allowedMediaTypes: ['application/x-www-form-urlencoded', 'application/json'],
          },
        },
        async (ctx) =>
          ctx.json({
            contentType: ctx.request?.headers.get('content-type') ?? null,
            body: ctx.body ?? null,
          }),
      ),
      testDeepPut: createAuthEndpoint('/test/a/b/c/d/e/f/g', { method: 'PUT' }, async (ctx) =>
        ctx.json({ deep: true }),
      ),
    },
  } satisfies BetterAuthPlugin
}
