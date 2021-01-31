import { Page } from 'puppeteer'

import { scrollThroughContainer } from './helpers/scroll-through-container'

export const scrollThroughMessages = async (page: Page): Promise<void> => {
  const container = '.msg-s-message-list'
  const elements = 'li.msg-s-message-list__event'

  await scrollThroughContainer(page, container, elements, true)
}
