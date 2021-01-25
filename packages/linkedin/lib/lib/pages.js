"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SectionPages = exports.Section = void 0;
const blank_page_1 = require("./blank.page");
const login_page_1 = require("./login.page");
const messages_page_1 = require("./messages.page");
var Section;
(function (Section) {
    Section["Blank"] = "Blank";
    Section["Login"] = "Login";
    Section["Messages"] = "Messages";
})(Section = exports.Section || (exports.Section = {}));
exports.SectionPages = {
    [Section.Blank]: blank_page_1.BlankPage,
    [Section.Login]: login_page_1.LoginPage,
    [Section.Messages]: messages_page_1.MessagesPage,
};
//# sourceMappingURL=pages.js.map