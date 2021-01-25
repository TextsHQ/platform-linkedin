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
exports.MessagesPage = void 0;
const intercept_response_1 = require("./intercept-response");
const scroll_through_threads_1 = require("./scroll-through-threads");
const getAllConversationThreads = (crawler) => __awaiter(void 0, void 0, void 0, function* () {
    const { page } = crawler;
    yield page.setRequestInterception(true);
    page.on("request", (request) => {
        request.continue();
    });
    page.on("response", intercept_response_1.interceptMessageResponse);
    yield scroll_through_threads_1.scrollThroughThreads(page);
    yield page.setRequestInterception(false);
    return intercept_response_1.messagesThreads.sort((a, b) => { var _a, _b; return ((_a = b === null || b === void 0 ? void 0 : b.conversation) === null || _a === void 0 ? void 0 : _a.lastActivityAt) - ((_b = a === null || a === void 0 ? void 0 : a.conversation) === null || _b === void 0 ? void 0 : _b.lastActivityAt); });
});
exports.MessagesPage = {
    getAllConversationThreads,
};
//# sourceMappingURL=index.js.map