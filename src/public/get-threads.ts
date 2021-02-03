import { MessagesPage } from '../lib/messages.page'
import { LinkedIn } from '../lib/types/linkedin.types'

export const getMessagesThreads = async (
  browserLinkedIn: LinkedIn<any>,
  maxThreads?: number,
) => {
  const { currentPage, browser } = (browserLinkedIn as LinkedIn<typeof MessagesPage>)
  const page = await browser.newPage()

  const messagesThreads = await currentPage.getAllConversationThreads(
    page,
    maxThreads,
  )

  return messagesThreads
}
