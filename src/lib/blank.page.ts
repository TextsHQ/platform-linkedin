import { Request } from 'puppeteer'
import { FEED_URL, LINKEDIN_CONVERSATIONS_ENDPOINT, LOGIN_URL, THREADS_URL } from './constants/linkedin'
// eslint-disable-next-line import/no-cycle
import { LoginPage } from './login.page'
// eslint-disable-next-line import/no-cycle
import { MessagesPage } from './messages.page'
import { LinkedIn } from './types/linkedin.types'
import { Section } from './types/sections.types'

const goToLogin = async (
  crawler: LinkedIn,
): Promise<LinkedIn<typeof LoginPage>> => {
  await crawler.page.goto(LOGIN_URL)

  return { ...crawler, currentPage: LoginPage }
}

const setSessionCookie = async (
  crawler: LinkedIn,
  sessionCookie: string,
): Promise<LinkedIn<typeof BlankPage>> => {
  const { page } = crawler
  await page.setCookie({
    name: 'li_at',
    value: sessionCookie,
    domain: '.www.linkedin.com',
  })

  return { ...crawler, page, currentPage: BlankPage }
}

const getRealTimeRequestAndCookies = async (crawler: LinkedIn) => {
  const { browser } = crawler
  const page = await browser.newPage()

  let realtimeRequest: Request
  await page.setRequestInterception(true)
  page.on('request', request => {
    if (request.url().includes(LINKEDIN_CONVERSATIONS_ENDPOINT) && !realtimeRequest) {
      realtimeRequest = request
    }

    request.continue()
  })

  await page.goto(FEED_URL)

  const cookies = (await page.cookies())
    .map(cookie => `${cookie.name}=${cookie.value}`)
    .join(';')

  await page.close()
  return { realtimeRequest, cookies }
}

const goToMessages = async (
  crawler: LinkedIn,
): Promise<LinkedIn<typeof MessagesPage>> => {
  const { page } = crawler

  await page.goto(THREADS_URL)

  const cookies = await page.cookies()
  const authCookie = cookies.find(({ name }) => name === 'li_at')

  if (!authCookie) throw new Error('No session cookie found')

  return { ...crawler, currentPage: MessagesPage }
}

export const BlankPage = {
  setSessionCookie,
  getRealTimeRequestAndCookies,
  goTo: {
    [Section.Login]: goToLogin,
    [Section.Messages]: goToMessages,
  },
}
