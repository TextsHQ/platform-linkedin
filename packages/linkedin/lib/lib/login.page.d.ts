import { LinkedIn } from "./index";
import { MessagesPage } from "./messages.page";
import { Section } from "./pages";
export interface LoginInformation {
    username: string;
    password: string;
}
export declare const LoginPage: {
    getSessionCookie: (crawler: LinkedIn) => Promise<string>;
    goTo: {
        Messages: (crawler: LinkedIn, { username, password }: LoginInformation) => Promise<LinkedIn<typeof MessagesPage>>;
    };
};
