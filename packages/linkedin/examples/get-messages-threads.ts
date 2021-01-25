import { getMessagesThreads } from "../src/index";

(async function () {
  try {
    const cookieSession = "";
    
    const threads = await getMessagesThreads(cookieSession);

    console.log(JSON.stringify(threads, null, 4));
  } catch (error) {
    console.error(error);
    process.exit(1);
  }

  process.exit(0);
})();
