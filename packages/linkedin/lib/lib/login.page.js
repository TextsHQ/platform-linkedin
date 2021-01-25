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
exports.LoginPage = void 0;
const messages_page_1 = require("./messages.page");
const pages_1 = require("./pages");
const login = (crawler, { username, password }) => __awaiter(void 0, void 0, void 0, function* () {
    const { page } = crawler;
    yield page.type("#username", username);
    yield page.type("#password", password);
    const click = page.click("button[type='submit']");
    const wait = page.waitForNavigation();
    yield Promise.all([click, wait]);
    return Object.assign(Object.assign({}, crawler), { currentPage: messages_page_1.MessagesPage });
});
const getSessionCookie = (crawler) => __awaiter(void 0, void 0, void 0, function* () {
    const { page } = crawler;
    yield page.waitFor(() => !document.querySelector("#password"));
    const cookies = yield page.cookies();
    const authCookie = cookies.find(({ name }) => name === "li_at");
    if (authCookie)
        return authCookie.value;
    else
        throw new Error("Error Getting Cookie");
});
exports.LoginPage = {
    getSessionCookie,
    goTo: {
        [pages_1.Section.Messages]: login,
    },
};
//# sourceMappingURL=login.page.js.map