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
const puppeteer = require("puppeteer");
class LinkedIn {
    constructor() {
        this.options = {
            sessionCookieValue: "",
            keepAlive: false,
            timeout: 10000,
            userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36",
            headless: false,
        };
        this.browser = null;
        this.sessionCookie = null;
        this.setup = () => __awaiter(this, void 0, void 0, function* () {
            try {
                this.browser = yield puppeteer.launch({
                    headless: this.options.headless,
                    args: [
                        ...(this.options.headless
                            ? "---single-process"
                            : "---start-maximized"),
                    ],
                    timeout: this.options.timeout,
                });
            }
            catch (err) {
                this.browser.close();
                throw err;
            }
        });
    }
    login() {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.setup();
                const page = yield this.browser.newPage();
                yield page.goto("https://www.linkedin.com/login");
                yield page.waitFor(() => !document.querySelector("#password"));
                const cookies = yield page.cookies();
                const authCookie = cookies.find(({ name }) => name === "li_at");
                if (authCookie)
                    this.sessionCookie = authCookie.value;
                else
                    throw new Error("Error Getting Cookie");
                return this.sessionCookie;
            }
            catch (error) {
                throw new Error(error.message);
            }
            finally {
                this.browser.close();
            }
        });
    }
    getMessages(sessionCookie) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.setup();
                const page = yield this.browser.newPage();
                yield page.setCookie({
                    name: "li_at",
                    value: sessionCookie,
                    domain: ".www.linkedin.com",
                });
                yield page.goto("https://www.linkedin.com/messaging");
                yield page.setRequestInterception(true);
                page.on("request", (request) => {
                    request.continue();
                });
                let messagesThreads = [];
                page.on("response", (response) => __awaiter(this, void 0, void 0, function* () {
                    var _a, _b, _c;
                    const conversationApiEndpoint = "/api/messaging/conversations";
                    if (response.url().includes(conversationApiEndpoint)) {
                        const res = yield response.json();
                        const entities = (_a = res === null || res === void 0 ? void 0 : res.included) === null || _a === void 0 ? void 0 : _a.filter((thread) => (thread === null || thread === void 0 ? void 0 : thread.$type) ===
                            "com.linkedin.voyager.identity.shared.MiniProfile");
                        const conversations = (_b = res === null || res === void 0 ? void 0 : res.included) === null || _b === void 0 ? void 0 : _b.filter((thread) => (thread === null || thread === void 0 ? void 0 : thread.$type) === "com.linkedin.voyager.messaging.Conversation");
                        const messagingMembers = (_c = res === null || res === void 0 ? void 0 : res.included) === null || _c === void 0 ? void 0 : _c.filter((thread) => (thread === null || thread === void 0 ? void 0 : thread.$type) === "com.linkedin.voyager.messaging.MessagingMember");
                        const parsedData = entities.reduce((prev, current) => {
                            const entityId = current === null || current === void 0 ? void 0 : current.entityUrn.split(":").pop();
                            const conversation = conversations.find((conversation) => {
                                return conversation["*participants"].some((participant) => participant.includes(entityId));
                            });
                            const messagingMember = messagingMembers.find((member) => {
                                return member.entityUrn.includes(entityId);
                            });
                            const currentData = Object.assign(Object.assign(Object.assign({}, messagingMember), conversation), current);
                            return [...prev, currentData];
                        }, []);
                        messagesThreads = [...messagesThreads, ...parsedData];
                    }
                }));
                const container = ".msg-conversations-container__conversations-list";
                yield page.waitForSelector(".msg-conversations-container__conversations-list");
                let threads = [];
                const maxThreads = 100;
                let previousHeight;
                let keepSearching = true;
                const containerElement = yield page.$(container);
                while (threads.length < maxThreads && keepSearching) {
                    threads = [...(yield page.$$("li.msg-conversation-listitem"))];
                    const newPreviousHeight = yield page.evaluate((e) => e.scrollHeight, containerElement);
                    if (newPreviousHeight !== previousHeight)
                        previousHeight = newPreviousHeight;
                    else
                        keepSearching = false;
                    yield page.evaluate((e) => e.scrollTo(0, e.scrollHeight), containerElement);
                    yield page.waitForFunction((e, ph) => e.scrollHeight >= ph, {}, containerElement, previousHeight);
                    yield page.waitForTimeout(1000);
                }
                messagesThreads = messagesThreads.sort((a, b) => (b === null || b === void 0 ? void 0 : b.lastActivityAt) - (a === null || a === void 0 ? void 0 : a.lastActivityAt));
                console.log({ messagesThreads });
                return threads;
            }
            catch (error) {
                throw new Error(error.message);
            }
            finally {
                this.browser.close();
            }
        });
    }
}
exports.default = LinkedIn;
//# sourceMappingURL=linkedin.js.map