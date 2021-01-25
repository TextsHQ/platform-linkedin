import { openBrowser, closeBrowser } from "../lib";

export const sendMessageToThread = async (
  session: string,
  threadId: string,
  message: string
): Promise<void> => {
  const blank = await openBrowser();
  await blank.currentPage.setSessionCookie(blank, session);

  const messagesCrawler = await blank.currentPage.goTo.Messages(blank);
  const { currentPage } = await messagesCrawler;

  await currentPage.sendMessageToThread(
    messagesCrawler,
    threadId,
    message
  );

  await closeBrowser(messagesCrawler);
};
