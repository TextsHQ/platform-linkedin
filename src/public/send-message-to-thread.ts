import { MessagesPage } from '../lib/messages.page'

export const sendMessageToThread = async (
  { request, cookies },
  threadId: string,
  message: string,
): Promise<void> => {
  await MessagesPage.sendMessageToThread(
    { request, cookies },
    threadId,
    message,
  )
}
