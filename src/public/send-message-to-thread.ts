import { MessagesPage } from '../lib/messages.page'
import { LinkedIn } from '../lib/types/linkedin.types'

export const sendMessageToThread = async (
  browserLinkedIn: LinkedIn<any>,
  threadId: string,
  message: string,
): Promise<void> => {
  const { currentPage, browser } = (browserLinkedIn as LinkedIn<typeof MessagesPage>)
  const page = await browser.newPage()

  await currentPage.sendMessageToThread(
    page,
    threadId,
    message,
  )
}
