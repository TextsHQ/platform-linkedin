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
exports.scrollThroughThreads = void 0;
const scrollThroughThreads = (page) => __awaiter(void 0, void 0, void 0, function* () {
    const container = ".msg-conversations-container__conversations-list";
    yield page.waitForSelector(container);
    const containerElement = yield page.$(container);
    let threads = [];
    const maxThreads = 500;
    let previousHeight;
    let keepSearching = true;
    while (threads.length < maxThreads && keepSearching) {
        threads = [...(yield page.$$("li.msg-conversation-listitem"))];
        const newPreviousHeight = yield page.evaluate((e) => e.scrollHeight, containerElement);
        if (newPreviousHeight !== previousHeight) {
            previousHeight = newPreviousHeight;
        }
        else {
            keepSearching = false;
        }
        yield page.evaluate((e) => e.scrollTo(0, e.scrollHeight), containerElement);
        yield page.waitForFunction((e, ph) => e.scrollHeight >= ph, {}, containerElement, previousHeight);
        yield page.waitForTimeout(1000);
    }
});
exports.scrollThroughThreads = scrollThroughThreads;
//# sourceMappingURL=scroll-through-threads.js.map