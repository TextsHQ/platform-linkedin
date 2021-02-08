import { parse as parseCookie } from 'cookie'
import axios from 'axios'
import { stringify as queryStringify } from 'querystring'
import got from 'got'
import { merge, pickBy } from 'lodash'

import { paramsSerializer } from './utils/paramsSerializer'
import { authHeaders } from './constants/headers'

/**
 * @param cookies
 */
const parseCookies = <T>(cookies: string[]): Partial<T> =>
  cookies.reduce((res, c) => {
    let parsedCookie = parseCookie(c)

    parsedCookie = pickBy(parsedCookie, (v, k) => k === Object.keys(parsedCookie)[0])

    return merge(res, parsedCookie)
  }, {})

export const login = async ({
  username,
  password,
}: {
  username: string;
  password: string;
}): Promise<any> => {
  try {
    const url = 'https://www.linkedin.com/uas/authenticate'
    const anonymousAuthResponse = await got(url)

    const sessionId = parseCookies<any>(anonymousAuthResponse.headers['set-cookie']).JSESSIONID!

    const payload = {
      session_key: username,
      session_password: password,
      JSESSIONID: sessionId,
    }

    // FIXME:
    // For any reason it is working with axios but not with got. This is maybe because the serializer
    // or what the withCredentials params do under the hood
    // @see https://stackoverflow.com/questions/43002444/make-axios-send-cookies-in-its-requests-automatically
    const request = axios.create({
      paramsSerializer,
      withCredentials: true,
    })

    const loginRes = await request.post(url, queryStringify(payload), {
      headers: authHeaders,
    })

    const parsedCookies = parseCookies<any>(loginRes.headers['set-cookie'])
    return parsedCookies
  } catch (error) {
    console.log('[ERROR]', error)
    return false
  }
}
