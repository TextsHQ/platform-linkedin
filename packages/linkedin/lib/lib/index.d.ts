import { Page, Browser } from "puppeteer";
import { SectionPages, Section } from "./pages";
export interface LinkedIn<LinkedInPage = void> {
    page: Page;
    browser: Browser;
    currentPage: LinkedInPage;
}
export declare const openBrowser: () => Promise<LinkedIn<typeof SectionPages[Section.Blank]>>;
export declare const closeBrowser: (crawler: LinkedIn<any>) => Promise<void>;
