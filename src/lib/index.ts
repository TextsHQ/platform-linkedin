import puppeteer from 'puppeteer'

// eslint-disable-next-line import/no-cycle
import { BlankPage } from './blank.page'
import { LINKEDIN_CONVERSATIONS_ENDPOINT } from './constants/linkedin'
// eslint-disable-next-line import/no-cycle
import { SectionPages } from './pages'
import { LinkedIn } from './types/linkedin.types'
import { Section } from './types/sections.types'

// eslint-disable-next-line import/no-mutable-exports
export let firstConversationsRequest: puppeteer.Request
let firstDate = 0

export const openBrowser = async (
  headless = true,
): Promise<LinkedIn<typeof SectionPages[Section.Blank]>> => {
  const browser = await puppeteer.launch({
    args: [],
    headless,
    ignoreHTTPSErrors: true,
  })

  const page = await browser.newPage()
  await page.setViewport({ width: 1100, height: 900 })
  await page.setRequestInterception(true)

  page.on('request', request => {
    // This is added because the first group of messages (first 20) comes
    // directly from server (it doesn't make any request to get them), so
    // this way we save the first request and then we can make a separated
    // request to get the first 20 messages threads.
    if (
      request.method() === 'GET'
      && request.url().includes(LINKEDIN_CONVERSATIONS_ENDPOINT)
      && request.url().includes('createdBefore')
    ) {
      const date = request.url().split('createdBefore=').pop()

      if (Number(date) > firstDate) {
        firstDate = Number(date)
        firstConversationsRequest = request
      }
    }

    request.continue()
  })

  return {
    page,
    browser,
    currentPage: BlankPage,
  }
}

export const closeBrowser = async (crawler: LinkedIn<any>): Promise<void> => {
  await crawler.browser.close()
}
