"use strict";

const LinkedIn = require("../lib/linkedin").default;
jest.setTimeout(30000);

describe("linkedin module", () => {
  // TODO: Create test
  it("works", async () => {
    const linkedin = new LinkedIn();
    // const cookieSession = await linkedin.login();

    const cookieSession = '' // FIXME
    const threads = await linkedin.getMessages(cookieSession)
    console.log(`Threads Length: ${threads.length}`);
  });
});
