import type { BaseEndpointConfig, NaviosZodRequest } from '../types.mjs'

export function bindUrlParams<Url extends string>(
  urlPart: Url,
  params: NaviosZodRequest<BaseEndpointConfig<any, Url, any, any, any>>,
) {
  const placement = /\$([a-zA-Z0-9]+)/g
  const match = urlPart.matchAll(placement)
  if (match && params.urlParams) {
    return Array.from(match)
      .map(([, group]) => group)
      .reduce(
        (newMessage, param) =>
          params.urlParams[param as string]
            ? newMessage.replaceAll(
                new RegExp(`\\$${param}`, 'g'),
                params.urlParams[param as string],
              )
            : newMessage,
        urlPart,
      )
  }

  return urlPart
}
