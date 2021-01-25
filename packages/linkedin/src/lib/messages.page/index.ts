import { LinkedIn } from "..";
import { interceptThreadResponse, thread } from "./intercept-thread-response";
import {
  interceptMessagesThreadsResponse,
  messagesThreads,
} from "./intercept-threads-response";
import { scrollThroughMessages } from "./scroll-through-messages";
import { scrollThroughThreads } from "./scroll-through-threads";

const getAllConversationThreads = async (crawler: LinkedIn): Promise<any> => {
  const { page } = crawler;

  page.on("response", interceptMessagesThreadsResponse);
  await scrollThroughThreads(page);

  return messagesThreads.sort(
    (a, b) => b?.conversation?.lastActivityAt - a?.conversation?.lastActivityAt
  );
};

const getThreadMessages = async (
  crawler: LinkedIn,
  threadId: string,
  maxMessages = 500
): Promise<any[]> => {
  const { page } = crawler;

  page.on("response", interceptThreadResponse);
  await page.goto(`https://www.linkedin.com/messaging/thread/${threadId}`);

  await scrollThroughMessages(page);
  await page.goto("https://www.linkedin.com/messaging");

  return thread;
};

const sendMessageToThread = async (
  crawler: LinkedIn,
  threadId: string,
  message: string
): Promise<void> => {
  const { page } = crawler;
  await page.goto(`https://www.linkedin.com/messaging/thread/${threadId}`);

  const textareaClass = ".msg-form__contenteditable";

  await page.type(textareaClass, message);
  await page.type(textareaClass, String.fromCharCode(13));

  await page.goto("https://www.linkedin.com/messaging");
};

export const MessagesPage = {
  getAllConversationThreads,
  getThreadMessages,
  sendMessageToThread,
};
