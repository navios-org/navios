import { describe, expect, it } from 'vitest'

import { canonicalPath, compileRequestPath, compileRoutePath } from '../routing/route-path.mjs'
import { RouteTable } from '../routing/route-table.mjs'

describe('compileRoutePath', () => {
  it('takes a path apart', () => {
    expect(compileRoutePath('/orgs/$orgId/members/$id')).toEqual({
      segments: [{ literal: 'orgs' }, { param: 'orgId' }, { literal: 'members' }, { param: 'id' }],
      params: ['orgId', 'id'],
    })
    expect(compileRoutePath('/').segments).toEqual([{ literal: '' }])
    expect(compileRoutePath('/users/').segments).toEqual([{ literal: 'users' }, { literal: '' }])
  })

  it('takes a rest param as the last segment', () => {
    expect(compileRoutePath('/files/$path*')).toEqual({
      segments: [{ literal: 'files' }, { rest: 'path' }],
      params: ['path'],
    })
    expect(compileRoutePath('/$all*').segments).toEqual([{ rest: 'all' }])
  })

  it('compares fixed text decoded', () => {
    expect(compileRoutePath('/caf%C3%A9/a.b+c(d);v=1/things:batch').segments).toEqual([
      { literal: 'café' },
      { literal: 'a.b+c(d);v=1' },
      { literal: 'things:batch' },
    ])
  })

  it.each([
    ['users', 'does not start with a slash'],
    ['/files/$name.json', 'a url param has to be a whole segment'],
    ['/two/$a-$b', 'a url param has to be a whole segment'],
    ['/opt/$id?', 'a url param has to be a whole segment'],
    ['/v$ver/x', 'a url param has to be a whole segment'],
    ['/x/$1st', 'a url param has to be a whole segment'],
    ['/x/$', 'a url param has to be a whole segment'],
    ['/users/:id', 'a url param is written "$name"'],
    ['/o/$id/p/$id', 'two url params named "id"'],
    ['/p/$__proto__', 'cannot have this name'],
    ['/a//b', 'an empty segment'],
    ['//a', 'an empty segment'],
    ['/a/*', 'cannot be matched'],
    ['/st*r', 'cannot be matched'],
    ['/q?x=1', 'cannot be matched'],
    ['/a#b', 'cannot be matched'],
    ['/a b', 'cannot be matched'],
    ['/a%20b', 'cannot be matched'],
    ['/a%2Fb', 'cannot be matched'],
    ['/a/../b', 'cannot be matched'],
    ['/a/%2e', 'cannot be matched'],
    ['/a\\b', 'cannot be matched'],
    ['/100%25', 'cannot be matched'],
    ['/%zz', 'not valid percent-encoding'],
    ['/users/$user-id', 'a name of letters, digits and underscores'],
    ['/files/$path*/meta', 'a rest param ("$path*") has to be the last segment'],
    ['/files/$path*/', 'a rest param ("$path*") has to be the last segment'],
    ['/o/$id/$id*', 'two url params named "id"'],
    ['/x/$*', 'a url param has to be a whole segment'],
    ['/x/$a**', 'a url param has to be a whole segment'],
  ])('refuses %s', (path, problem) => {
    expect(() => compileRoutePath(path)).toThrow(problem)
  })
})

describe('compileRequestPath', () => {
  it('is the path of the route with the params of the request', () => {
    const path = compileRequestPath(compileRoutePath('/items/$id/parts/$part/'))
    expect(path({ id: 'a/b', part: '1;v=2@x:y' })).toBe('/items/a%2Fb/parts/1;v=2@x:y/')
    expect(path({ id: 'п %', part: '\ud800' })).toBe('/items/%D0%BF%20%25/parts/%EF%BF%BD/')
    expect(compileRequestPath(compileRoutePath('/caf%C3%A9'))({})).toBe('/caf%C3%A9')
    expect(compileRequestPath(compileRoutePath('/café'))({})).toBe('/caf%C3%A9')
    expect(compileRequestPath(compileRoutePath('/'))({})).toBe('/')
  })
})

describe('compileRequestPath of a rest param', () => {
  it('keeps the slashes of a rest param and encodes each segment', () => {
    const path = compileRequestPath(compileRoutePath('/files/$path*'))
    expect(path({ path: 'a/b c/d' })).toBe('/files/a/b%20c/d')
    expect(path({ path: 'one' })).toBe('/files/one')
  })
})

describe('canonicalPath', () => {
  it.each([
    ['/admin/secrets', '/admin/secrets'],
    ['/admin?x=/y#z', '/admin'],
    ['/%61dmin/%2E%7e', '/admin/.~'],
    ['/a%2fb%3a', '/a%2Fb%3A'],
    ['http://x/admin?q', '/admin'],
    ['http://x', '/'],
    ['http://x?a=/b', '/'],
    ['//items/1', '//items/1'],
    ['*', '*'],
    ['/%zz', '/%zz'],
  ])('%s', (target, path) => {
    expect(canonicalPath(target)).toBe(path)
  })
})

describe('RouteTable', () => {
  const table = (...routes: Array<[string, string]>) => {
    const result = new RouteTable<string>()
    for (const [method, path] of routes) {
      result.add(method, compileRoutePath(path), `${method} ${path}`)
    }
    return result
  }

  it('prefers fixed text at the first segment that differs', () => {
    const routes = table(
      ['GET', '/pairs/$a/$b'],
      ['GET', '/pairs/$a/fixed'],
      ['GET', '/pairs/fixed/$b'],
    )
    expect(routes.match('GET', '/pairs/fixed/fixed')).toEqual({
      value: 'GET /pairs/fixed/$b',
      urlParams: { b: 'fixed' },
    })
    expect(routes.match('GET', '/pairs/x/fixed')?.value).toBe('GET /pairs/$a/fixed')
    expect(routes.match('GET', '/pairs/x/y%2Fz')?.urlParams).toEqual({ a: 'x', b: 'y/z' })
  })

  it('matches no empty segment, dot segment or trailing slash that is not declared', () => {
    const routes = table(['GET', '/items/$id'], ['GET', '/trail/'])
    for (const path of [
      '/items/',
      '/items/..',
      '/items/%2e%2E',
      '/items/.',
      '/items/1/',
      '/trail',
    ]) {
      expect(routes.match('GET', path), path).toBeUndefined()
    }
    expect(routes.match('GET', '/trail/')?.value).toBe('GET /trail/')
    expect(routes.match('GET', '*')).toBeUndefined()
  })

  it('serves HEAD with the GET route, and knows the methods of a path', () => {
    const routes = table(
      ['GET', '/a'],
      ['POST', '/a'],
      ['HEAD', '/h'],
      ['GET', '/h'],
      ['PUT', '/$x'],
    )
    expect(routes.match('HEAD', '/a')?.value).toBe('GET /a')
    expect(routes.match('HEAD', '/h')?.value).toBe('HEAD /h')
    expect(routes.match('DELETE', '/a')).toBeUndefined()
    expect(routes.methods('/a')).toEqual(['GET', 'HEAD', 'POST', 'PUT'])
    expect(routes.methods('/nope/x')).toEqual([])
  })

  it('matches one or more segments with a rest param, each decoded', () => {
    const routes = table(['GET', '/files/$path*'])
    expect(routes.match('GET', '/files/a')).toEqual({
      value: 'GET /files/$path*',
      urlParams: { path: 'a' },
    })
    expect(routes.match('GET', '/files/a/b/c')?.urlParams).toEqual({ path: 'a/b/c' })
    expect(routes.match('GET', '/files/a%20b/c%2Fd')?.urlParams).toEqual({ path: 'a b/c/d' })
    for (const path of [
      '/files',
      '/files/',
      '/files/a//b',
      '/files/a/',
      '/files/./a',
      '/files/a/..',
    ]) {
      expect(routes.match('GET', path), path).toBeUndefined()
    }
  })

  it('prefers fixed text and url params to a rest param, whatever the order', () => {
    const routes = table(
      ['GET', '/files/$path*'],
      ['GET', '/files/$id/meta'],
      ['GET', '/files/readme'],
      ['GET', '/files/$id'],
      ['GET', '/files/docs/$path*'],
    )
    expect(routes.match('GET', '/files/readme')?.value).toBe('GET /files/readme')
    expect(routes.match('GET', '/files/x')?.value).toBe('GET /files/$id')
    expect(routes.match('GET', '/files/x/meta')?.value).toBe('GET /files/$id/meta')
    expect(routes.match('GET', '/files/x/other')).toEqual({
      value: 'GET /files/$path*',
      urlParams: { path: 'x/other' },
    })
    expect(routes.match('GET', '/files/docs/a/b')).toEqual({
      value: 'GET /files/docs/$path*',
      urlParams: { path: 'a/b' },
    })
  })

  it('decodes a path only for the routes that may match it', () => {
    const routes = table(['GET', '/files/$path*'], ['GET', '/items/$id'])
    expect(routes.match('GET', '/nope/a/b/c/%zz')).toBeUndefined()
    expect(routes.methods('/nope/%zz/b')).toEqual([])
    expect(() => routes.match('GET', '/files/a/%zz')).toThrow(URIError)
    expect(() => routes.match('GET', '/items/%zz')).toThrow(URIError)
  })

  it('knows the methods of a path a rest param matches, and serves HEAD with its GET', () => {
    const routes = table(['GET', '/api/$path*'], ['POST', '/api/$path*'], ['PUT', '/api/x'])
    expect(routes.methods('/api/x')).toEqual(['GET', 'HEAD', 'POST', 'PUT'])
    expect(routes.methods('/api/a/b')).toEqual(['GET', 'HEAD', 'POST'])
    expect(routes.match('HEAD', '/api/a/b')?.value).toBe('GET /api/$path*')
  })

  it('throws for percent-encoding that is not valid, or decodes as it is told', () => {
    expect(() => table(['GET', '/items/$id']).match('GET', '/items/%zz')).toThrow(URIError)
    const lenient = new RouteTable<string>((text) => text.replaceAll('%zz', '?'))
    lenient.add('GET', compileRoutePath('/items/$id'), 'x')
    expect(lenient.match('GET', '/items/%zz')?.urlParams).toEqual({ id: '?' })
  })
})
