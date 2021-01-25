import { getSessionCookie } from "../src/index";

(async function () {
  try {
    const cookie = await getSessionCookie();
    console.log(JSON.stringify(cookie, null, 4));
  } catch (error) {
    console.error(error);
    process.exit(1);
  }

  process.exit(0);
})();
