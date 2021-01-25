import { sendMessageToThread } from "../src/index";

(async function () {
  try {
    const cookieSession = "";
    const threadId = "";
    const message = "test from texts.com";

    await sendMessageToThread(cookieSession, threadId, message);
  } catch (error) {
    console.error(error);
    process.exit(1);
  }

  process.exit(0);
})();
