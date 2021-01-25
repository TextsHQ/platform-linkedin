import { BlankPage } from "./blank.page";
import { LoginPage } from "./login.page";
import { MessagesPage } from "./messages.page";

export enum Section {
  Blank = 'Blank',
  Login = 'Login',
  Messages = 'Messages',
}

export const SectionPages: any = {
  [Section.Blank]: BlankPage,
  [Section.Login]: LoginPage,
  [Section.Messages]: MessagesPage,
};
