import { openBrowser, closeBrowser } from '../lib'

export const getSessionCookie = async (loginCredentials: { username: string; password: string }): Promise<string> => {
  const blank = await openBrowser()
  const login = await blank.currentPage.goTo.Login(blank)

  const sessionCookie = await login.currentPage.getSessionCookie(login, loginCredentials)

  await closeBrowser(login)

  return sessionCookie
}
