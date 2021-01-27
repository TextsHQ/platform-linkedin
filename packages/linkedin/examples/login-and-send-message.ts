import {
  sendMessageToThread,
  getSessionCookie,
  getMessagesThreads,
  getThreadMessages,
} from "../src/index";

(async function () {
  try {
    const cookieSession = await getSessionCookie();
    const threads = await getMessagesThreads(cookieSession, 30);
    
    const firstThreadId = threads[0]?.conversation?.entityUrn?.split(':').pop();
    // If we want to get the thread messages
    // const messages = await getThreadMessages(cookieSession, firstThreadId);
    
    const message = "test from texts.com";
    await sendMessageToThread(cookieSession, firstThreadId, message);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }

  process.exit(0);
})();
