// eslint-disable-next-line import/no-cycle
import { MessagesPage } from './messages.page'
import { LINKEDIN_USER_ENDPOINT } from './constants/linkedin'
import { LinkedIn } from './types/linkedin.types'
import { Section } from './types/sections.types'

export interface LoginInformation {
  username: string;
  password: string;
}

const login = async (
  crawler: LinkedIn,
  { username, password }: LoginInformation,
): Promise<LinkedIn<typeof MessagesPage>> => {
  const { page } = crawler
  await page.type('#username', username)
  await page.type('#password', password)

  const click = page.click("button[type='submit']")
  const wait = page.waitForNavigation()
  await Promise.all([click, wait])

  return {
    ...crawler,
    currentPage: MessagesPage,
  }
}

/**
 * @param crawler
 * @returns {string}
 */
const getSessionCookie = async (
  crawler: LinkedIn,
  { username, password }: LoginInformation,
): Promise<{ session: string, currentUser: any }> => {
  const { page } = crawler
  let userMetadata: any

  await page.setRequestInterception(true)

  page.on('request', request => request.continue())
  page.on('response', async response => {
    const responseUrl = response.url()
    const shouldIntercept = responseUrl.includes(LINKEDIN_USER_ENDPOINT)

    if (shouldIntercept) {
      const res = await response.json()
      userMetadata = res
    }
  })

  await page.type('#username', username)
  await page.type('#password', password)

  const click = page.click("button[type='submit']")
  const wait = page.waitForNavigation()
  await Promise.all([click, wait])

  const railSelector = '.profile-rail-card__actor-link'
  await page.waitForSelector(railSelector)
  // @ts-expect-error
  const userName = await page.$eval(railSelector, el => el.innerText)

  const cookies = await page.cookies()
  const authCookie = cookies.find(({ name }) => name === 'li_at')

  if (!authCookie) throw new Error('Error Getting Cookie')

  return {
    session: authCookie.value,
    currentUser: { userName, ...userMetadata },
  }
}

export const LoginPage = {
  getSessionCookie,
  goTo: {
    [Section.Messages]: login,
  },
}
