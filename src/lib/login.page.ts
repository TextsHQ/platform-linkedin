// eslint-disable-next-line import/no-cycle
import { MessagesPage } from './messages.page'
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
const getSessionCookie = async (crawler: LinkedIn): Promise<string> => {
  const { page } = crawler
  // This needs to be refactored because waitFor function will be deprecated
  // in a future. I've tried with waitForFunction but has some problems with
  // async functions
  // @ts-ignore
  await page.waitFor(() => !document.querySelector('#password'))

  const cookies = await page.cookies()
  const authCookie = cookies.find(({ name }) => name === 'li_at')

  if (authCookie) return authCookie.value
  throw new Error('Error Getting Cookie')
}

export const LoginPage = {
  getSessionCookie,
  goTo: {
    [Section.Messages]: login,
  },
}
