import { reduce } from 'lodash'
import { requestHeaders } from '../constants/headers'

export const createRequestHeaders = cookies => {
  const parsedCookies = cookies.reduce((prev, current) => ({
    ...prev,
    // This is done to be sure that the cookies doesn't have the quotes (""). For some reason
    // some of the LinkedIn cookies comes with the quotes and other without them
    [current.key]: current.value.replace(/"/g, ''),
  }), {})
  const cookieString = reduce(parsedCookies, (res, v, k) => `${res}${k}="${v}"; `, '')

  return {
    ...requestHeaders,
    'csrf-token': parsedCookies.JSESSIONID!,
    cookie: cookieString,
  }
}
