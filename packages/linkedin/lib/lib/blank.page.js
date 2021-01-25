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
exports.BlankPage = void 0;
const login_page_1 = require("./login.page");
const messages_page_1 = require("./messages.page");
const pages_1 = require("./pages");
const goToLogin = (crawler) => __awaiter(void 0, void 0, void 0, function* () {
    const loginUrl = "https://www.linkedin.com/login";
    yield crawler.page.goto(loginUrl);
    return Object.assign(Object.assign({}, crawler), { currentPage: login_page_1.LoginPage });
});
const setSessionCookie = (crawler, sessionCookie) => __awaiter(void 0, void 0, void 0, function* () {
    const { page } = crawler;
    yield page.setCookie({
        name: "li_at",
        value: sessionCookie,
        domain: ".www.linkedin.com",
    });
    return Object.assign(Object.assign({}, crawler), { page, currentPage: exports.BlankPage });
});
const goToMessages = (crawler) => __awaiter(void 0, void 0, void 0, function* () {
    const { page } = crawler;
    yield page.goto("https://www.linkedin.com/messaging");
    const cookies = yield page.cookies();
    const authCookie = cookies.find(({ name }) => name === "li_at");
    if (!authCookie)
        throw new Error("No session cookie found");
    return Object.assign(Object.assign({}, crawler), { currentPage: messages_page_1.MessagesPage });
});
exports.BlankPage = {
    setSessionCookie,
    goTo: {
        [pages_1.Section.Login]: goToLogin,
        [pages_1.Section.Messages]: goToMessages,
    },
};
//# sourceMappingURL=blank.page.js.map