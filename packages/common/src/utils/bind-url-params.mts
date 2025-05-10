import type { NaviosRequestConfig } from 'navios'

import type { UrlHasParams, UrlParams } from '../types.mjs'

export function bindUrlParams<Url extends string>(
  urlPart: Url,
  params: Omit<NaviosRequestConfig<any, {}>, 'method' | 'url' | 'data'> &
    (UrlHasParams<Url> extends true
      ? {
          urlParams: UrlParams<Url>
        }
      : {}) &
    ({} | { data: { [x: string]: any } }),
) {
  const placement = /\$([a-zA-Z0-9]+)/g
  const match = urlPart.matchAll(placement)
  // @ts-expect-error TS2551 We checked the line before
  if (match && params.urlParams) {
    return Array.from(match)
      .map(([, group]) => group)
      .reduce(
        (newMessage, param) =>
          // @ts-expect-error TS18048 we checked urlParams before
          params.urlParams[param as string]
            ? newMessage.replaceAll(
                new RegExp(`\\$${param}`, 'g'),
                // @ts-expect-error TS18048 we checked urlParams before
                params.urlParams[param as string],
              )
            : newMessage,
        urlPart,
      )
  }

  return urlPart
}
