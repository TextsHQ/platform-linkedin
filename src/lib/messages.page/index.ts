import got from 'got'
import { CookieJar } from 'tough-cookie'

// eslint-disable-next-line import/no-cycle
import { firstConversationsRequest } from '..'
import { LINKEDIN_BASE, THREADS_URL } from '../constants/linkedin'
import { LinkedIn } from '../types/linkedin.types'
import { parseConversationResponse } from './helpers/parse-conversation-response'
import { interceptThreadResponse, thread } from './intercept-thread-response'
import {
  interceptMessagesThreadsResponse,
  messagesThreads,
} from './intercept-threads-response'
import { scrollThroughMessages } from './scroll-through-messages'
import { scrollThroughThreads } from './scroll-through-threads'

const getAllConversationThreads = async (
  crawler: LinkedIn,
  maxThreads?: number,
): Promise<any> => {
  const { page } = crawler

  page.on('response', interceptMessagesThreadsResponse)
  await scrollThroughThreads(page, maxThreads)
  // Intercepting the conversations API doesn't provide the first group of elements
  // (they already comes rendered from server). So we need to request them replacing
  // from the first API request the 'createdBefore' param to 'createAfter'.
  const cookies = (await page.cookies())
    .map(cookie => `${cookie.name}=${cookie.value}`)
    .join(';')

  const url = firstConversationsRequest.url().replace('createdBefore', 'createdAfter')
  const cookieJar = new CookieJar()
  await cookieJar.setCookie(cookies, LINKEDIN_BASE)

  const { body } = await got(url, {
    headers: { ...firstConversationsRequest.headers(), cookie: cookies },
    cookieJar,
  })

  const firstResponseParsed = parseConversationResponse(JSON.parse(body))

  return [...firstResponseParsed, ...messagesThreads]
    .sort(
      (a, b) => b?.conversation?.lastActivityAt - a?.conversation?.lastActivityAt,
    ).filter((x: any) => {
      const threadId = x?.conversation?.entityUrn?.split(':').pop()
      return Boolean(threadId)
    })
}

const getThreadMessages = async (
  crawler: LinkedIn,
  threadId: string,
  maxMessages = 500,
): Promise<any[]> => {
  const { page } = crawler

  page.on('response', interceptThreadResponse)
  await page.goto(`${THREADS_URL}/thread/${threadId}`)

  await scrollThroughMessages(page)
  await page.goto(THREADS_URL)

  return thread
}

const sendMessageToThread = async (
  crawler: LinkedIn,
  threadId: string,
  message: string,
): Promise<void> => {
  const { page } = crawler
  await page.goto(`${THREADS_URL}/thread/${threadId}`)

  const textareaClass = '.msg-form__contenteditable'

  await page.type(textareaClass, message)
  await page.type(textareaClass, String.fromCharCode(13))

  await page.goto(THREADS_URL)
}

export const MessagesPage = {
  getAllConversationThreads,
  getThreadMessages,
  sendMessageToThread,
}
