import { openBrowser, closeBrowser } from "../lib";

export const getThreadMessages = async (session: string, threadId: string) => {
  const blank = await openBrowser();
  await blank.currentPage.setSessionCookie(blank, session);

  const messagesCrawler = await blank.currentPage.goTo.Messages(blank);
  const { currentPage } = await messagesCrawler;

  const threadMessages = await currentPage.getThreadMessages(
    messagesCrawler,
    threadId
  );

  await closeBrowser(messagesCrawler);

  return threadMessages;
};
