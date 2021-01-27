import { openBrowser, closeBrowser } from "../lib";

export const getMessagesThreads = async (
  session: string,
  maxThreads?: number
) => {
  const blank = await openBrowser();
  await blank.currentPage.setSessionCookie(blank, session);

  const messagesCrawler = await blank.currentPage.goTo.Messages(blank);
  const { currentPage } = await messagesCrawler;
  const messagesThreads = await currentPage.getAllConversationThreads(
    messagesCrawler,
    maxThreads
  );

  await closeBrowser(messagesCrawler);

  return messagesThreads;
};
