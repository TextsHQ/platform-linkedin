import * as puppeteer from 'puppeteer'

import { LINKEDIN_CONVERSATIONS_ENDPOINT } from '../constants/linkedin'
import { parseConversationResponse } from './helpers/parse-conversation-response'

// eslint-disable-next-line import/no-mutable-exports
export let messagesThreads = []

export const interceptMessagesThreadsResponse = async (
  response: puppeteer.Response,
): Promise<void> => {
  const responseUrl = response.url()
  const shouldIntercept = responseUrl.includes(LINKEDIN_CONVERSATIONS_ENDPOINT)

  if (shouldIntercept) {
    const res: any = await response.json()
    const parsedData = parseConversationResponse(res)

    messagesThreads = [...messagesThreads, ...parsedData]
  }
}
