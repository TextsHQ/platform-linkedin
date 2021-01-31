import { Page } from 'puppeteer'

export const scrollThroughContainer = async (
  page: Page,
  container: string,
  elements: string,
  reverse = false,
  maxElements: number = 500,
): Promise<void> => {
  await page.waitForSelector(container)
  const containerElement = await page.$(container)

  let threads = []

  let previousHeight
  let keepSearching = true

  // This needs to be refactored
  while (threads.length < maxElements && keepSearching) {
    threads = [...(await page.$$(elements))]

    const newPreviousHeight = await page.evaluate(
      e => e.scrollHeight,
      containerElement,
    )

    if (newPreviousHeight !== previousHeight) {
      previousHeight = newPreviousHeight
    } else {
      keepSearching = false
    }

    await page.evaluate(
      (e, rev) => e.scrollTo(0, rev ? 0 : e.scrollHeight),
      containerElement,
      reverse,
    )

    await page.waitForFunction(
      (e, ph, rev) =>
        (rev ? e.scrollHeight <= ph : e.scrollHeight >= ph),
      {},
      containerElement,
      previousHeight,
      reverse,
    )

    await page.waitForTimeout(1000)
  }
}
