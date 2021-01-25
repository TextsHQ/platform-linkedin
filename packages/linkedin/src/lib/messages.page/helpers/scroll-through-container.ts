import { Page } from "puppeteer";

export const scrollThroughContainer = async (
  page: Page,
  container: string,
  elements: string,
  reverse = false
): Promise<void> => {
  await page.waitForSelector(container);
  const containerElement = await page.$(container);

  let threads = [];
  const maxThreads = 500;

  let previousHeight;
  let keepSearching = true;

  // This needs to be refactored
  while (threads.length < maxThreads && keepSearching) {
    threads = [...(await page.$$(elements))];

    const newPreviousHeight = await page.evaluate(
      (e) => e.scrollHeight,
      containerElement
    );

    if (newPreviousHeight !== previousHeight) {
      previousHeight = newPreviousHeight;
    } else {
      keepSearching = false;
    }

    await page.evaluate(
      // @ts-ignore
      (e, reverse) => e.scrollTo(0, reverse ? 0 : e.scrollHeight),
      containerElement,
      reverse
    );

    await page.waitForFunction(
      (e, ph, reverse) =>
        reverse ? e.scrollHeight <= ph : e.scrollHeight >= ph,
      {},
      containerElement,
      previousHeight,
      reverse
    );

    await page.waitForTimeout(1000);
  }
};
