/**
 * Pages whose public path changed. Keys are old paths, values are the paths that replaced them,
 * both without a trailing slash. `finalize-build.mts` writes a redirect for each entry and
 * `check-urls.mts` verifies it.
 */
export const renamedPages: Record<string, string> = {
  '/docs/builder/react-query/advanced/streams': '/docs/builder/react-query/advanced/file-downloads',
  '/docs/builder/react-query/guides/multipart-mutations': '/docs/builder/react-query/guides/file-uploads',
}
