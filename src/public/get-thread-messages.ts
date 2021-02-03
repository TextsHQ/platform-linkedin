import { MessagesPage } from '../lib/messages.page'
import { LinkedIn } from '../lib/types/linkedin.types'

export const getThreadMessages = async (browserLinkedIn: LinkedIn<any>, threadId: string) => {
  const { currentPage, browser } = (browserLinkedIn as LinkedIn<typeof MessagesPage>)
  const page = await browser.newPage()

  const threadMessages = await currentPage.getThreadMessages(
    page,
    threadId,
  )

  return threadMessages
}
