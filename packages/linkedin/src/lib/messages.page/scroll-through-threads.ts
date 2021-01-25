import { Page } from "puppeteer";

import { scrollThroughContainer } from "./helpers/scroll-through-container";

export const scrollThroughThreads = async (page: Page): Promise<void> => {
  const container = ".msg-conversations-container__conversations-list";
  const elements = "li.msg-conversation-listitem";

  await scrollThroughContainer(page, container, elements);
};
