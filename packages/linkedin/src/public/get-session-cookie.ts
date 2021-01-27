import { openBrowser, closeBrowser } from "../lib";

export const getSessionCookie = async (): Promise<string> => {
  const blank = await openBrowser(false);
  const login = await blank.currentPage.goTo.Login(blank);

  const sessionCookie = await login.currentPage.getSessionCookie(login)

  await closeBrowser(login);

  return sessionCookie;
};
