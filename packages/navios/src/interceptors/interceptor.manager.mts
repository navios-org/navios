import type { NaviosError, NaviosInternalError } from '../NaviosError.mjs'
import type { NaviosResponse, PreparedRequestConfig } from '../types.mjs'

import { bodyRequestInterceptor } from './default/body.request.interceptor.mjs'
import {
  jsonErrorInterceptor,
  jsonResponseInterceptor,
} from './default/json.response.interceptor.mjs'
import { paramsRequestInterceptor } from './default/params.request.interceptor.mjs'

export const defaultInterceptors = {
  request: {
    init: [paramsRequestInterceptor, bodyRequestInterceptor],
    rejected: [],
  },
  response: {
    success: [jsonResponseInterceptor],
    rejected: [jsonErrorInterceptor],
  },
}

export function createInterceptorManager() {
  let id = 0
  const initRequestInterceptors: Map<number, (config: PreparedRequestConfig<any, any>) => any> =
    new Map()
  const successResponseInterceptors: Map<number, (response: NaviosResponse<any>) => any> = new Map()
  const rejectedRequestInterceptors: Map<number, (response: NaviosInternalError) => any> = new Map()
  const rejectedResponseInterceptors: Map<number, (response: NaviosInternalError) => any> =
    new Map()

  function useRequestInterceptor(
    handler: null | ((onInit: PreparedRequestConfig<any, any>) => any),
    onRejected?: (config: NaviosInternalError) => any,
  ) {
    id++
    if (handler) {
      initRequestInterceptors.set(id, handler)
    }
    if (onRejected) {
      rejectedRequestInterceptors.set(id, onRejected)
    }
    return id
  }

  function useResponseInterceptor(
    onSuccess: null | ((response: NaviosResponse<any>) => any),
    onReject?: (response: NaviosInternalError) => any,
  ) {
    id++
    if (onSuccess) {
      successResponseInterceptors.set(id, onSuccess)
    }
    if (onReject) {
      rejectedResponseInterceptors.set(id, onReject)
    }
    return id
  }
  defaultInterceptors.request.init.forEach((interceptor) => useRequestInterceptor(interceptor))
  defaultInterceptors.request.rejected.forEach((interceptor) =>
    useRequestInterceptor(null, interceptor),
  )
  defaultInterceptors.response.success.forEach((interceptor) => useResponseInterceptor(interceptor))
  defaultInterceptors.response.rejected.forEach((interceptor) =>
    useResponseInterceptor(null, interceptor),
  )

  return {
    interceptors: {
      request: {
        init: initRequestInterceptors,
        rejected: rejectedRequestInterceptors,
      },
      response: {
        success: successResponseInterceptors,
        rejected: rejectedResponseInterceptors,
      },
    },
    request: {
      use: useRequestInterceptor,
      eject: (id: number) => {
        initRequestInterceptors.delete(id)
        rejectedRequestInterceptors.delete(id)
      },
      clear: () => {
        initRequestInterceptors.clear()
        rejectedRequestInterceptors.clear()
      },
    },
    response: {
      use: useResponseInterceptor,
      eject: (id: number) => {
        successResponseInterceptors.delete(id)
        rejectedResponseInterceptors.delete(id)
      },
      clear: () => {
        successResponseInterceptors.clear()
        rejectedResponseInterceptors.clear()
      },
    },
  }
}
