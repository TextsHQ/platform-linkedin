import * as puppeteer from "puppeteer";
export declare let messagesThreads: any[];
export declare const interceptMessageResponse: (response: puppeteer.Response) => Promise<void>;
