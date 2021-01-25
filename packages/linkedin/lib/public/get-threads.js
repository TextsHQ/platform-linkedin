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
exports.getMessagesThreads = void 0;
const lib_1 = require("../lib");
const getMessagesThreads = (session) => __awaiter(void 0, void 0, void 0, function* () {
    const blank = yield lib_1.openBrowser();
    yield blank.currentPage.setSessionCookie(blank, session);
    const messagesCrawler = yield blank.currentPage.goTo.Messages(blank);
    console.log({ messagesCrawler });
    const messagesThreads = yield messagesCrawler.currentPage.getAllConversationThreads(messagesCrawler);
    console.log({ messagesThreads });
});
exports.getMessagesThreads = getMessagesThreads;
//# sourceMappingURL=get-threads.js.map