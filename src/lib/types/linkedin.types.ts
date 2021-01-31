import { Page, Browser } from 'puppeteer'

export interface LinkedIn<LinkedInPage = void> {
  page: Page;
  browser: Browser;
  currentPage: LinkedInPage;
}
