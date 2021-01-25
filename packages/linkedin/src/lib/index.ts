import * as puppeteer from "puppeteer";
import { Page, Browser } from "puppeteer";

import { BlankPage } from "./blank.page";
import { SectionPages, Section } from "./pages";

export interface LinkedIn<LinkedInPage = void> {
  page: Page;
  browser: Browser;
  currentPage: LinkedInPage;
}

export const openBrowser = async (): Promise<
  LinkedIn<typeof SectionPages[Section.Blank]>
> => {
  const browser = await puppeteer.launch({
    args: [],
    headless: false,
    ignoreHTTPSErrors: true,
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 900 });
  await page.setRequestInterception(true);

  page.on("request", (request) => {
    request.continue();
  });

  return {
    page,
    browser,
    currentPage: BlankPage,
  };
};

export const closeBrowser = async (crawler: LinkedIn<any>): Promise<void> => {
  await crawler.browser.close();
};

