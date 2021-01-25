import { getThreadMessages } from "../src/index";

(async function () {
  try {
    const cookieSession = "";
    const threadId = "";

    const messages = await getThreadMessages(cookieSession, threadId);

    console.log(JSON.stringify(messages, null, 4));
  } catch (error) {
    console.error(error);
    process.exit(1);
  }

  process.exit(0);
})();
