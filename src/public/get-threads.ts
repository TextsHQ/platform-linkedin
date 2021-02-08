import { MessagesPage } from '../lib/messages.page'
import { LinkedIn } from '../lib/types/linkedin.types'

export const getThreads = async (request, cookies: string) => {
  // const { currentPage, browser } = (browserLinkedIn as LinkedIn<typeof MessagesPage>)
  // const page = await browser.newPage()

  const messagesThreads = await MessagesPage.getAllConversationThreads(request, cookies)

  return messagesThreads
}
