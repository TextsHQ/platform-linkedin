"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.closeBrowser = exports.openBrowser = void 0;
const puppeteer = require("puppeteer");
const blank_page_1 = require("./blank.page");
const openBrowser = () => __awaiter(void 0, void 0, void 0, function* () {
    const browser = yield puppeteer.launch({
        args: [],
        headless: false,
        ignoreHTTPSErrors: true,
    });
    const page = yield browser.newPage();
    yield page.setViewport({ width: 1100, height: 900 });
    return {
        page,
        browser,
        currentPage: blank_page_1.BlankPage,
    };
});
exports.openBrowser = openBrowser;
const closeBrowser = (crawler) => __awaiter(void 0, void 0, void 0, function* () {
    yield crawler.browser.close();
});
exports.closeBrowser = closeBrowser;
//# sourceMappingURL=index.js.map