import { reduce } from 'lodash'
import { requestHeaders } from '../constants/headers'

export const createRequestHeaders = cookies => {
  const cookieString = reduce(cookies, (res, v, k) => `${res}${k}="${v}"; `, '')

  return {
    ...requestHeaders,
    cookie: cookieString,
    'csrf-token': cookies.JSESSIONID!,
  }
}
