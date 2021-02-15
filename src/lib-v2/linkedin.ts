import { CookieJar } from 'tough-cookie'

export default class LinkedInAPI {
  private cookieJar: CookieJar = null

  private requestHeaders: any = null

  setLoginState = async (cookieJar: CookieJar) => {
    if (!cookieJar) throw TypeError()
    this.cookieJar = cookieJar
  }
}
