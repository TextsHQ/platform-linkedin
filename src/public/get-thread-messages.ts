import { MessagesPage } from '../lib/messages.page'

export const getThreadMessages = async ({ request, cookies }, threadId: string) => {
  const threadMessages = await MessagesPage.getThreadMessages(
    { request, cookies },
    threadId,
  )

  return threadMessages
}
