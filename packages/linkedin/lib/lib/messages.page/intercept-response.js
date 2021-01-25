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
exports.interceptMessageResponse = exports.messagesThreads = void 0;
exports.messagesThreads = [];
const interceptMessageResponse = (response) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const conversationApiEndpoint = "/api/messaging/conversations";
    const responseUrl = response.url();
    const shouldIntercept = responseUrl.includes(conversationApiEndpoint);
    if (shouldIntercept) {
        const res = yield response.json();
        const entities = (_a = res === null || res === void 0 ? void 0 : res.included) === null || _a === void 0 ? void 0 : _a.filter((thread) => (thread === null || thread === void 0 ? void 0 : thread.$type) === "com.linkedin.voyager.identity.shared.MiniProfile");
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
            const currentData = {
                entity: current,
                messagingMember,
                conversation,
            };
            return [...prev, currentData];
        }, []);
        exports.messagesThreads = [...exports.messagesThreads, ...parsedData];
    }
});
exports.interceptMessageResponse = interceptMessageResponse;
//# sourceMappingURL=intercept-response.js.map