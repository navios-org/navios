import type {
  AbstractRequestConfig,
  BaseStreamConfig,
  HttpMethod,
  NaviosZodRequest,
} from '../types.mjs'

export function makeRequestConfig<Config extends BaseStreamConfig>(
  request: NaviosZodRequest<Config>,
  options: Config,
  method: HttpMethod,
  finalUrlPart: string,
  isMultipart = false,
) {
  return {
    ...request,
    params: options.querySchema
      ? // @ts-expect-error TS2339 We know that sometimes querySchema can generate a default value
        options.querySchema.parse(request.params)
      : {},
    method,
    url: finalUrlPart,
    data: isMultipart
      ? makeFormData(request, options)
      : 'requestSchema' in options
        ? // @ts-expect-error TS2339 We know that sometimes querySchema can generate a default value
          options.requestSchema.parse(request.data)
        : undefined,
  } satisfies AbstractRequestConfig
}

export function makeFormData<Config extends BaseStreamConfig>(
  request: NaviosZodRequest<Config>,
  options: Config,
) {
  const formData = new FormData()
  const validatedRequest = options.requestSchema
    ? // @ts-expect-error TS2339 We know that sometimes querySchema can generate a default value
      options.requestSchema.parse(request.data)
    : request.data
  for (const key in validatedRequest) {
    const value = validatedRequest[key]
    if (value instanceof File) {
      formData.append(key, value, value.name)
    } else {
      formData.append(key, value)
    }
  }
  return formData
}
