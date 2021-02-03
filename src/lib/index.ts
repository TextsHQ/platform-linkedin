import puppeteer from 'puppeteer'

// eslint-disable-next-line import/no-cycle
import { BlankPage } from './blank.page'
// eslint-disable-next-line import/no-cycle
import { MessagesPage } from './messages.page'
import { LinkedIn } from './types/linkedin.types'

export const openBrowser = async (
  headless = true,
): Promise<LinkedIn<any>> => {
  const browser = await puppeteer.launch({
    args: [],
    headless,
    ignoreHTTPSErrors: true,
  })

  const page = await browser.newPage()
  await page.setViewport({ width: 1100, height: 900 })

  return {
    page,
    browser,
    currentPage: { ...BlankPage, ...MessagesPage },
  }
}

export const closeBrowser = async (crawler: LinkedIn<any>): Promise<void> => {
  await crawler.browser.close()
}
